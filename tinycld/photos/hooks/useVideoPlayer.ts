import { useCallback, useState } from 'react'

interface VideoPlayerState {
    isPlaying: boolean
    position: number
    duration: number
    isMuted: boolean
}

export function useVideoPlayer(
    videoRef: React.RefObject<{
        playAsync?: () => void
        pauseAsync?: () => void
        setPositionAsync?: (p: number) => void
        setIsMutedAsync?: (m: boolean) => void
    }>
) {
    const [state, setState] = useState<VideoPlayerState>({
        isPlaying: false,
        position: 0,
        duration: 0,
        isMuted: false,
    })

    const play = useCallback(() => {
        setState(s => ({ ...s, isPlaying: true }))
        videoRef.current?.playAsync?.()
    }, [videoRef])

    const pause = useCallback(() => {
        setState(s => ({ ...s, isPlaying: false }))
        videoRef.current?.pauseAsync?.()
    }, [videoRef])

    const togglePlay = useCallback(() => {
        if (state.isPlaying) pause()
        else play()
    }, [state.isPlaying, play, pause])

    const seek = useCallback(
        (position: number) => {
            setState(s => ({ ...s, position }))
            videoRef.current?.setPositionAsync?.(position)
        },
        [videoRef]
    )

    const toggleMute = useCallback(() => {
        setState(s => ({ ...s, isMuted: !s.isMuted }))
        videoRef.current?.setIsMutedAsync?.(!state.isMuted)
    }, [videoRef, state.isMuted])

    return {
        ...state,
        play,
        pause,
        togglePlay,
        seek,
        toggleMute,
    }
}
