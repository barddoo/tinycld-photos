package photos

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"math"
	"os"
	"runtime"
	"strings"
	"sync"

	ort "github.com/yalue/onnxruntime_go"
)

type FaceDetectResult struct {
	BBox      [4]float32
	Landmarks [10]float32
	Score     float32
}

type FaceRecogResult struct {
	Embedding []float32
}

type CLIPResult struct {
	Embedding []float32
}

type OCRResult struct {
	Text       string
	Confidence float32
	BBox       [][2]float32
}

type InferenceEngine struct {
	libPath  string
	cacheDir string

	sessions map[ModelTask]*ort.DynamicAdvancedSession
	names    map[ModelTask]*modelIONames
	mu       sync.RWMutex

	available bool
	gpuReady  string
}

type modelIONames struct {
	InputNames   []string
	OutputNames  []string
	OutputShapes []ort.Shape
}

func NewInferenceEngine(libPath, cacheDir string) *InferenceEngine {
	return &InferenceEngine{
		libPath:  libPath,
		cacheDir: cacheDir,
		sessions: make(map[ModelTask]*ort.DynamicAdvancedSession),
		names:    make(map[ModelTask]*modelIONames),
	}
}

func (e *InferenceEngine) Init() error {
	ort.SetSharedLibraryPath(e.libPath)
	if err := ort.InitializeEnvironment(); err != nil {
		return fmt.Errorf("init onnxruntime: %w", err)
	}
	e.available = true
	return nil
}

func (e *InferenceEngine) GPUProvider() string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.gpuReady
}

func (e *InferenceEngine) IsAvailable() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.available
}

func (e *InferenceEngine) buildSessionOptions() *ort.SessionOptions {
	opts, err := ort.NewSessionOptions()
	if err != nil {
		return nil
	}

	opts.SetIntraOpNumThreads(runtime.NumCPU())
	opts.SetGraphOptimizationLevel(ort.GraphOptimizationLevelEnableAll)

	deviceID := os.Getenv("MACHINE_LEARNING_DEVICE_ID")
	if deviceID == "" {
		deviceID = "0"
	}

	ep := os.Getenv("MACHINE_LEARNING_EXECUTION_PROVIDER")

	// try CUDA (NVIDIA) — skip on macOS
	if (ep == "" || ep == "cuda") && runtime.GOOS != "darwin" {
		if co, cerr := ort.NewCUDAProviderOptions(); cerr == nil {
			co.Update(map[string]string{"device_id": deviceID})
			if err := opts.AppendExecutionProviderCUDA(co); err == nil {
				e.gpuReady = "cuda"
			}
			co.Destroy()
		}
	}

	// try CoreML (macOS) — only if no GPU found yet or explicitly asked
	if ep == "coreml" || (ep == "" && e.gpuReady == "") {
		coreMLOpts := map[string]string{"MLComputeUnits": "ALL"}
		if err := opts.AppendExecutionProviderCoreMLV2(coreMLOpts); err == nil {
			e.gpuReady = "coreml"
		}
	}

	// try ROCm (AMD) — only if no GPU found yet or explicitly asked
	if ep == "rocm" || (ep == "" && e.gpuReady == "") {
		if devs, derr := ort.GetEpDevices(); derr == nil {
			for _, d := range devs {
				if d.EpName() == "ROCM" {
					ropts := map[string]string{"device_id": deviceID}
					if err := opts.AppendExecutionProviderV2([]ort.EpDevice{d}, ropts); err == nil {
						e.gpuReady = "rocm"
					}
					break
				}
			}
		}
	}

	return opts
}

func (e *InferenceEngine) setGPU(provider string) {
	e.mu.Lock()
	e.gpuReady = provider
	e.mu.Unlock()
}

func (e *InferenceEngine) isGPUReady() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.gpuReady != ""
}

func (e *InferenceEngine) LoadModel(task ModelTask, modelPath string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	inInfo, outInfo, err := ort.GetInputOutputInfo(modelPath)
	if err != nil {
		return fmt.Errorf("get io info: %w", err)
	}

	inNames := make([]string, len(inInfo))
	outNames := make([]string, len(outInfo))
	for i, info := range inInfo {
		inNames[i] = info.Name
	}
	for i, info := range outInfo {
		outNames[i] = info.Name
	}

	outShapes := make([]ort.Shape, len(outInfo))
	for i, info := range outInfo {
		s := make(ort.Shape, len(info.Dimensions))
		copy(s, info.Dimensions)
		outShapes[i] = s
	}

	opts := e.buildSessionOptions()
	if opts == nil {
		return fmt.Errorf("failed to create session options")
	}
	defer opts.Destroy()

	session, err := ort.NewDynamicAdvancedSession(modelPath, inNames, outNames, opts)
	if err != nil {
		return fmt.Errorf("new session: %w", err)
	}

	if old, ok := e.sessions[task]; ok {
		old.Destroy()
	}

	e.sessions[task] = session
	e.names[task] = &modelIONames{InputNames: inNames, OutputNames: outNames, OutputShapes: outShapes}

	return nil
}

func (e *InferenceEngine) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	for _, session := range e.sessions {
		session.Destroy()
	}

	if e.available {
		ort.DestroyEnvironment()
	}

	e.available = false
	return nil
}

func (e *InferenceEngine) DetectFaces(images [][]byte) ([][]FaceDetectResult, error) {
	e.mu.RLock()
	session, ok := e.sessions[TaskFaceDetection]
	e.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("face detection model not loaded")
	}

	batchSize := len(images)
	if batchSize == 0 {
		return nil, nil
	}

	processed, err := e.preprocessBatch(images, 640, 640)
	if err != nil {
		return nil, fmt.Errorf("preprocess: %w", err)
	}

	inputData := imagesToFloat32(processed, 640, 640)
	inputShape := ort.NewShape(int64(batchSize), 3, 640, 640)
	inputTensor, err := ort.NewTensor(inputShape, inputData)
	if err != nil {
		return nil, fmt.Errorf("input tensor: %w", err)
	}
	defer inputTensor.Destroy()

	ioNames := e.names[TaskFaceDetection]
	outputShapes := make([]ort.Shape, len(ioNames.OutputShapes))
	for i, shape := range ioNames.OutputShapes {
		s := make(ort.Shape, len(shape))
		for j, dim := range shape {
			if dim == -1 || dim == 0 {
				s[j] = int64(batchSize)
			} else {
				s[j] = dim
			}
		}
		outputShapes[i] = s
	}

	outputs := make([]ort.Value, len(ioNames.OutputNames))
	for i, shape := range outputShapes {
		oTensor, err := ort.NewEmptyTensor[float32](shape)
		if err != nil {
			return nil, fmt.Errorf("output tensor %d: %w", i, err)
		}
		defer oTensor.Destroy()
		outputs[i] = oTensor
	}

	if err := session.Run([]ort.Value{inputTensor}, outputs); err != nil {
		return nil, fmt.Errorf("run: %w", err)
	}

	// SCRFD output format: 9 tensors across 3 strides (8, 16, 32)
	// outputs[0,1,2]: scores  shape [N, 1]
	// outputs[3,4,5]: bboxes  shape [N, 4] (ltrb distances from anchor)
	// outputs[6,7,8]: landmarks shape [N, 10]
	if len(outputs) != 9 {
		results := make([][]FaceDetectResult, batchSize)
		return results, nil
	}

	strides := []int{8, 16, 32}
	results := make([][]FaceDetectResult, batchSize)
	for b := range results {
		results[b] = []FaceDetectResult{}
	}

	for si, stride := range strides {
		scores := outputs[si].(*ort.Tensor[float32]).GetData()
		bboxes := outputs[si+3].(*ort.Tensor[float32]).GetData()
		lmarks := outputs[si+6].(*ort.Tensor[float32]).GetData()

		fmapSize := 640 / stride
		numAnchors := fmapSize * fmapSize * 2

		for b := 0; b < batchSize; b++ {
			for a := 0; a < numAnchors; a++ {
				conf := scores[b*numAnchors+a]
				if conf < 0.5 {
					continue
				}

				// decode anchor center
				anchorIdx := a / 2
				row := anchorIdx / fmapSize
				col := anchorIdx % fmapSize
				cx := float32((col*stride + stride/2))
				cy := float32((row*stride + stride/2))

				// decode ltrb bbox
				bi := (b*numAnchors + a) * 4
				x1 := cx - bboxes[bi]*float32(stride)
				y1 := cy - bboxes[bi+1]*float32(stride)
				x2 := cx + bboxes[bi+2]*float32(stride)
				y2 := cy + bboxes[bi+3]*float32(stride)

				var face FaceDetectResult
				face.Score = conf
				face.BBox = [4]float32{x1, y1, x2, y2}

				li := (b*numAnchors + a) * 10
				if li+10 <= len(lmarks) {
					copy(face.Landmarks[:], lmarks[li:li+10])
				}
				results[b] = append(results[b], face)
			}
		}
	}
	return results, nil
}

func (e *InferenceEngine) RecognizeFaces(croppedFaces [][]byte) ([][]float32, error) {
	e.mu.RLock()
	session, ok := e.sessions[TaskFaceRecognition]
	e.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("face recognition model not loaded")
	}

	batchSize := len(croppedFaces)
	if batchSize == 0 {
		return nil, nil
	}

	processed, err := e.preprocessBatch(croppedFaces, 112, 112)
	if err != nil {
		return nil, fmt.Errorf("preprocess: %w", err)
	}

	inputData := imagesToFloat32(processed, 112, 112)
	inputShape := ort.NewShape(int64(batchSize), 3, 112, 112)
	inputTensor, err := ort.NewTensor(inputShape, inputData)
	if err != nil {
		return nil, fmt.Errorf("input tensor: %w", err)
	}
	defer inputTensor.Destroy()

	outputShape := ort.NewShape(int64(batchSize), 512)
	outputTensor, err := ort.NewEmptyTensor[float32](outputShape)
	if err != nil {
		return nil, fmt.Errorf("output tensor: %w", err)
	}
	defer outputTensor.Destroy()

	if err := session.Run([]ort.Value{inputTensor}, []ort.Value{outputTensor}); err != nil {
		return nil, fmt.Errorf("run: %w", err)
	}

	data := outputTensor.GetData()
	embeddings := make([][]float32, batchSize)
	for i := range embeddings {
		embeddings[i] = data[i*512 : (i+1)*512]
	}
	return embeddings, nil
}

func (e *InferenceEngine) EncodeClipVisual(images [][]byte) ([][]float32, error) {
	e.mu.RLock()
	session, ok := e.sessions[TaskCLIPVisual]
	e.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("CLIP visual model not loaded")
	}

	batchSize := len(images)
	if batchSize == 0 {
		return nil, nil
	}

	processed, err := e.preprocessBatch(images, 224, 224)
	if err != nil {
		return nil, fmt.Errorf("preprocess: %w", err)
	}

	inputData := imagesToFloat32(processed, 224, 224)
	inputShape := ort.NewShape(int64(batchSize), 3, 224, 224)
	inputTensor, err := ort.NewTensor(inputShape, inputData)
	if err != nil {
		return nil, fmt.Errorf("input tensor: %w", err)
	}
	defer inputTensor.Destroy()

	outputShape := ort.NewShape(int64(batchSize), 512)
	outputTensor, err := ort.NewEmptyTensor[float32](outputShape)
	if err != nil {
		return nil, fmt.Errorf("output tensor: %w", err)
	}
	defer outputTensor.Destroy()

	if err := session.Run([]ort.Value{inputTensor}, []ort.Value{outputTensor}); err != nil {
		return nil, fmt.Errorf("run: %w", err)
	}

	data := outputTensor.GetData()
	embeddings := make([][]float32, batchSize)
	for i := range embeddings {
		embeddings[i] = data[i*512 : (i+1)*512]
	}
	return embeddings, nil
}

func (e *InferenceEngine) EncodeClipText(texts []string) ([][]float32, error) {
	return nil, fmt.Errorf("CLIP text encoding requires proper BPE tokenizer — not yet implemented")
}

func (e *InferenceEngine) RunOCR(images [][]byte) ([]OCRResult, error) {
	e.mu.RLock()
	_, detOK := e.sessions[TaskOCRDetection]
	_, recOK := e.sessions[TaskOCRRecognition]
	e.mu.RUnlock()

	if !detOK || !recOK {
		return nil, fmt.Errorf("OCR models not loaded")
	}

	return make([]OCRResult, len(images)), nil
}

func (e *InferenceEngine) preprocessBatch(images [][]byte, targetW, targetH int) ([][]byte, error) {
	result := make([][]byte, len(images))
	for i, imgData := range images {
		img, _, err := image.Decode(bytes.NewReader(imgData))
		if err != nil {
			return nil, fmt.Errorf("decode %d: %w", i, err)
		}
		resized := resizeImage(img, targetW, targetH)
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, resized, nil); err != nil {
			return nil, fmt.Errorf("encode %d: %w", i, err)
		}
		result[i] = buf.Bytes()
	}
	return result, nil
}

func imagesToFloat32(images [][]byte, width, height int) []float32 {
	n := len(images)
	if n == 0 {
		return nil
	}
	data := make([]float32, n*3*width*height)

	for i, imgData := range images {
		img, _, err := image.Decode(bytes.NewReader(imgData))
		if err != nil {
			continue
		}

		bounds := img.Bounds()
		w := bounds.Dx()
		h := bounds.Dy()
		base := i * 3 * width * height
		limW := min(w, width)
		limH := min(h, height)

		for y := 0; y < limH; y++ {
			for x := 0; x < limW; x++ {
				r, g, b, _ := img.At(x, y).RGBA()
				idx := base + y*width + x
				data[idx] = (float32(b>>8) - 127.5) / 128.0
				data[idx+width*height] = (float32(g>>8) - 127.5) / 128.0
				data[idx+2*width*height] = (float32(r>>8) - 127.5) / 128.0
			}
		}
	}

	return data
}

func resizeImage(img image.Image, targetW, targetH int) image.Image {
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	if srcW == targetW && srcH == targetH {
		return img
	}

	dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	scaleX := float64(srcW) / float64(targetW)
	scaleY := float64(srcH) / float64(targetH)

	for dy := 0; dy < targetH; dy++ {
		for dx := 0; dx < targetW; dx++ {
			sx := int(float64(dx) * scaleX)
			sy := int(float64(dy) * scaleY)
			if sx >= srcW {
				sx = srcW - 1
			}
			if sy >= srcH {
				sy = srcH - 1
			}
			dst.Set(dx, dy, img.At(sx, sy))
		}
	}

	return dst
}

func cosineSimilarity(a, b []float32) float32 {
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return float32(dot / (math.Sqrt(normA) * math.Sqrt(normB)))
}

func tokenizeTexts(texts []string, maxLen int) [][]int {
	tokenIDs := make([][]int, len(texts))
	for i, text := range texts {
		ids := make([]int, maxLen)
		ids[0] = 49406
		words := strings.Fields(strings.ToLower(text))
		pos := 1
		for _, w := range words {
			if pos >= maxLen-1 {
				break
			}
			ids[pos] = simpleToken(w)
			pos++
		}
		ids[pos] = 49407
		tokenIDs[i] = ids
	}
	return tokenIDs
}

func simpleToken(word string) int {
	h := 0
	for _, c := range word {
		h = h*31 + int(c)
		if h < 0 {
			h = -h
		}
	}
	return (h % 49405) + 1
}
