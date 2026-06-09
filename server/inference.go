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

const ClipDim = 768

type InferenceEngine struct {
	libPath  string
	cacheDir string

	sessions  map[ModelTask]*ort.DynamicAdvancedSession
	names     map[ModelTask]*modelIONames
	tokenizer *UnigramTokenizer
	mu        sync.RWMutex

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

func (e *InferenceEngine) HasClipTextual() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	_, ok := e.sessions[TaskCLIPTextual]
	return ok
}

func (e *InferenceEngine) HasTokenizer() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.tokenizer != nil
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

	if task == TaskCLIPTextual {
		tokPath := strings.TrimSuffix(modelPath, "model.onnx") + "tokenizer.json"
		if tok, err := loadUnigramTokenizer(tokPath); err == nil {
			e.tokenizer = tok
		}
	}

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

func (e *InferenceEngine) DetectFaces(images [][]byte, minScore float32) ([][]FaceDetectResult, error) {
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
				if conf < minScore {
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
	if batchSize > 1 {
		embeddings := make([][]float32, 0, batchSize)
		for _, image := range images {
			one, err := e.EncodeClipVisual([][]byte{image})
			if err != nil {
				return nil, err
			}
			embeddings = append(embeddings, one[0])
		}
		return embeddings, nil
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

	outputShape := ort.NewShape(int64(batchSize), ClipDim)
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
		embeddings[i] = data[i*ClipDim : (i+1)*ClipDim]
	}
	return embeddings, nil
}

func (e *InferenceEngine) EncodeClipText(texts []string) ([][]float32, error) {
	e.mu.RLock()
	session, ok := e.sessions[TaskCLIPTextual]
	ioNames := e.names[TaskCLIPTextual]
	e.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("CLIP textual model not loaded")
	}

	batchSize := len(texts)
	if batchSize == 0 {
		return nil, nil
	}
	if batchSize > 1 {
		embeddings := make([][]float32, 0, batchSize)
		for _, text := range texts {
			one, err := e.EncodeClipText([]string{text})
			if err != nil {
				return nil, err
			}
			embeddings = append(embeddings, one[0])
		}
		return embeddings, nil
	}

	maxLen := 64
	e.mu.RLock()
	tok := e.tokenizer
	e.mu.RUnlock()

	var tokenized [][]int32
	if tok != nil {
		tokenized = make([][]int32, len(texts))
		for i, text := range texts {
			tokenized[i] = tok.Encode(text, maxLen)
		}
	} else {
		// Fallback: legacy hash tokenizer (produces poor quality embeddings).
		raw := tokenizeTexts(texts, maxLen)
		tokenized = make([][]int32, len(raw))
		for i, ids := range raw {
			t32 := make([]int32, len(ids))
			for j, v := range ids {
				t32[j] = int32(v)
			}
			tokenized[i] = t32
		}
	}

	inputIds := make([]int32, batchSize*maxLen)
	attnMask := make([]int32, batchSize*maxLen)
	for i, ids := range tokenized {
		for j, id := range ids {
			inputIds[i*maxLen+j] = id
			if id != 0 {
				attnMask[i*maxLen+j] = 1
			}
		}
	}

	inputShape := ort.NewShape(int64(batchSize), int64(maxLen))
	inputIdsTensor, err := ort.NewTensor(inputShape, inputIds)
	if err != nil {
		return nil, fmt.Errorf("input_ids tensor: %w", err)
	}
	defer inputIdsTensor.Destroy()

	attnMaskTensor, err := ort.NewTensor(inputShape, attnMask)
	if err != nil {
		return nil, fmt.Errorf("attention_mask tensor: %w", err)
	}
	defer attnMaskTensor.Destroy()

	outputShape := ort.NewShape(int64(batchSize), ClipDim)
	outputTensor, err := ort.NewEmptyTensor[float32](outputShape)
	if err != nil {
		return nil, fmt.Errorf("output tensor: %w", err)
	}
	defer outputTensor.Destroy()

	inputs := make([]ort.Value, len(ioNames.InputNames))
	for i, name := range ioNames.InputNames {
		lower := strings.ToLower(name)
		if strings.Contains(lower, "input_ids") || strings.Contains(lower, "input") {
			inputs[i] = inputIdsTensor
		} else if strings.Contains(lower, "attention") || strings.Contains(lower, "mask") {
			inputs[i] = attnMaskTensor
		} else {
			inputs[i] = inputIdsTensor
		}
	}

	if err := session.Run(inputs, []ort.Value{outputTensor}); err != nil {
		return nil, fmt.Errorf("run: %w", err)
	}

	data := outputTensor.GetData()
	embeddings := make([][]float32, batchSize)
	for i := range embeddings {
		embeddings[i] = data[i*ClipDim : (i+1)*ClipDim]
	}
	return embeddings, nil
}

func (e *InferenceEngine) RunOCR(images [][]byte) ([]OCRResult, error) {
	e.mu.RLock()
	detSession, detOK := e.sessions[TaskOCRDetection]
	detNames := e.names[TaskOCRDetection]
	recSession, recOK := e.sessions[TaskOCRRecognition]
	recNames := e.names[TaskOCRRecognition]
	e.mu.RUnlock()

	if !detOK || !recOK {
		return nil, fmt.Errorf("OCR models not loaded")
	}

	batchSize := len(images)
	if batchSize == 0 {
		return nil, nil
	}

	var allResults []OCRResult

	for _, imgData := range images {
		img, _, err := image.Decode(bytes.NewReader(imgData))
		if err != nil {
			continue
		}

		detResults, err := e.runOCRDetection(detSession, detNames, img)
		if err != nil || len(detResults) == 0 {
			continue
		}

		recResults, err := e.runOCRRecognition(recSession, recNames, img, detResults)
		if err != nil {
			continue
		}

		allResults = append(allResults, recResults...)
	}

	return allResults, nil
}

func (e *InferenceEngine) runOCRDetection(session *ort.DynamicAdvancedSession, names *modelIONames, img image.Image) ([][4]float32, error) {
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	maxDim := 736
	scale := float64(maxDim) / float64(max(srcW, srcH))
	if scale >= 1.0 {
		scale = 1.0
	}
	detW := int(float64(srcW) * scale)
	detH := int(float64(srcH) * scale)
	detW = (detW + 31) / 32 * 32
	detH = (detH + 31) / 32 * 32

	resized := resizeImage(img, detW, detH)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, resized, nil); err != nil {
		return nil, fmt.Errorf("encode resized: %w", err)
	}
	encoded := buf.Bytes()

	inputData := imagesToFloat32([][]byte{encoded}, detW, detH)
	inputShape := ort.NewShape(1, 3, int64(detH), int64(detW))
	inputTensor, err := ort.NewTensor(inputShape, inputData)
	if err != nil {
		return nil, fmt.Errorf("input tensor: %w", err)
	}
	defer inputTensor.Destroy()

	outputShape := ort.NewShape(1, 1, int64(detH), int64(detW))
	outputTensor, err := ort.NewEmptyTensor[float32](outputShape)
	if err != nil {
		return nil, fmt.Errorf("output tensor: %w", err)
	}
	defer outputTensor.Destroy()

	if err := session.Run([]ort.Value{inputTensor}, []ort.Value{outputTensor}); err != nil {
		return nil, fmt.Errorf("detection run: %w", err)
	}

	data := outputTensor.GetData()
	threshold := float32(0.5)
	var boxes [][4]float32

	for y := 0; y < detH; y++ {
		for x := 0; x < detW; x++ {
			score := data[y*detW+x]
			if score > threshold {
				boxes = append(boxes, [4]float32{
					float32(x) / float32(detW) * float32(srcW),
					float32(y) / float32(detH) * float32(srcH),
					float32(x+1) / float32(detW) * float32(srcW),
					float32(y+1) / float32(detH) * float32(srcH),
				})
			}
		}
	}

	return mergeTextBoxes(boxes), nil
}

func (e *InferenceEngine) runOCRRecognition(session *ort.DynamicAdvancedSession, names *modelIONames, img image.Image, boxes [][4]float32) ([]OCRResult, error) {
	var results []OCRResult

	for _, box := range boxes {
		x1, y1 := int(box[0]), int(box[1])
		x2, y2 := int(box[2]), int(box[3])
		if x1 < 0 {
			x1 = 0
		}
		if y1 < 0 {
			y1 = 0
		}
		bounds := img.Bounds()
		if x2 > bounds.Dx() {
			x2 = bounds.Dx()
		}
		if y2 > bounds.Dy() {
			y2 = bounds.Dy()
		}
		if x2 <= x1 || y2 <= y1 {
			continue
		}

		type subImager interface {
			SubImage(image.Rectangle) image.Image
		}
		si, ok := img.(subImager)
		if !ok {
			continue
		}
		crop := si.SubImage(image.Rect(x1, y1, x2, y2))

		recW := 320
		recH := 48
		resized := resizeImage(crop, recW, recH)
		var cropBuf bytes.Buffer
		if err := jpeg.Encode(&cropBuf, resized, nil); err != nil {
			continue
		}
		encoded := cropBuf.Bytes()

		inputData := imagesToFloat32([][]byte{encoded}, recW, recH)
		inputShape := ort.NewShape(1, 3, int64(recH), int64(recW))
		inputTensor, err := ort.NewTensor(inputShape, inputData)
		if err != nil {
			continue
		}
		defer inputTensor.Destroy()

		outputShape := ort.NewShape(int64(recW), 1, 6625)
		outputTensor, err := ort.NewEmptyTensor[float32](outputShape)
		if err != nil {
			continue
		}
		defer outputTensor.Destroy()

		if err := session.Run([]ort.Value{inputTensor}, []ort.Value{outputTensor}); err != nil {
			continue
		}

		data := outputTensor.GetData()
		text := decodeOCRText(data, recW)
		if text != "" {
			results = append(results, OCRResult{
				Text:       text,
				Confidence: 0.9,
				BBox:       [][2]float32{{box[0], box[1]}, {box[2], box[1]}, {box[2], box[3]}, {box[0], box[3]}},
			})
		}
	}

	return results, nil
}

func decodeOCRText(data []float32, seqLen int) string {
	charset := "0123456789abcdefghijklmnopqrstuvwxyz"
	var result []byte
	prevIdx := 0
	for i := 0; i < seqLen; i++ {
		offset := i * 6625
		maxIdx := 0
		maxVal := data[offset]
		for c := 1; c < len(charset)+1; c++ {
			if offset+c < len(data) && data[offset+c] > maxVal {
				maxVal = data[offset+c]
				maxIdx = c
			}
		}
		if maxIdx > 0 && maxIdx != prevIdx {
			if maxIdx <= len(charset) {
				result = append(result, charset[maxIdx-1])
			}
		}
		prevIdx = maxIdx
	}
	return string(result)
}

func mergeTextBoxes(boxes [][4]float32) [][4]float32 {
	if len(boxes) == 0 {
		return boxes
	}
	type box struct{ x1, y1, x2, y2 float32 }
	merged := []box{
		{boxes[0][0], boxes[0][1], boxes[0][2], boxes[0][3]},
	}
	for _, b := range boxes[1:] {
		last := &merged[len(merged)-1]
		if b[0] <= last.x2+5 && b[1] >= last.y1-10 && b[1] <= last.y2+10 {
			if b[0] < last.x1 {
				last.x1 = b[0]
			}
			if b[2] > last.x2 {
				last.x2 = b[2]
			}
			if b[1] < last.y1 {
				last.y1 = b[1]
			}
			if b[3] > last.y2 {
				last.y2 = b[3]
			}
		} else {
			merged = append(merged, box{b[0], b[1], b[2], b[3]})
		}
	}
	result := make([][4]float32, len(merged))
	for i, m := range merged {
		result[i] = [4]float32{m.x1, m.y1, m.x2, m.y2}
	}
	return result
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
