"use client";

interface ZaraAvatarProps {
  isSpeaking?: boolean;
  isListening?: boolean;
  caption?: string;
  statusText?: string;
}

export default function ZaraAvatar({
  isSpeaking = false,
  isListening = false,
  caption = "",
  statusText,
}: ZaraAvatarProps) {
  const showBubble = Boolean(caption.trim());

  return (
    <div className="relative flex flex-col items-center justify-center w-full min-h-[240px] sm:min-h-[300px] lg:min-h-[360px] px-4 py-6 sm:py-8 overflow-hidden rounded-xl bg-gradient-to-br from-aqua/10 via-cream/40 to-aqua-light/20">
      <div
        className="absolute w-48 h-48 sm:w-64 sm:h-64 lg:w-80 lg:h-80 rounded-full bg-[radial-gradient(circle,rgba(0,184,184,0.15),transparent_70%)] pointer-events-none animate-zara-glow"
        aria-hidden
      />

      {statusText && (
        <div
          className={`absolute top-3 sm:top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium backdrop-blur-sm max-w-[calc(100%-2rem)] ${
            isSpeaking
              ? "bg-aqua/15 border border-aqua/25 text-teal-dark"
              : isListening
                ? "bg-green-100 border border-green-200 text-green-800"
                : "bg-white/70 border border-aqua/15 text-muted"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isSpeaking ? "bg-aqua animate-pulse" : isListening ? "bg-green-500 animate-pulse" : "bg-muted"
            }`}
          />
          <span className="truncate">{statusText}</span>
        </div>
      )}

      <div className="relative z-10 mt-6 sm:mt-8">
        {isSpeaking && (
          <>
            <span className="absolute -top-2 -right-2 w-3 h-3 rounded-full bg-aqua-light animate-zara-sparkle" aria-hidden />
            <span className="absolute -bottom-1 -left-3 w-2 h-2 rounded-full bg-aqua animate-zara-sparkle [animation-delay:0.4s]" aria-hidden />
            <span className="absolute top-1 -left-4 w-2.5 h-2.5 rounded-full bg-cream-warm animate-zara-sparkle [animation-delay:0.8s]" aria-hidden />
          </>
        )}
        <div
          className={`w-24 h-24 sm:w-32 sm:h-32 lg:w-36 lg:h-36 rounded-full flex items-center justify-center text-3xl sm:text-4xl lg:text-5xl font-bold text-inverse bg-gradient-to-br from-aqua to-aqua-dark shadow-glow transition-all duration-300 ${
            isSpeaking ? "animate-zara-speak" : ""
          } ${isListening ? "ring-4 ring-green-400/50 shadow-[0_8px_40px_rgba(34,197,94,0.3)]" : ""}`}
        >
          Z
        </div>
      </div>

      <div className="relative z-10 mt-4 flex items-center gap-2 text-sm text-body font-medium">
        <span className={`w-2 h-2 rounded-full shrink-0 ${isSpeaking || isListening ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-aqua/60"}`} />
        <span>AI Interviewer</span>
      </div>

      {showBubble && (
        <div className="relative z-10 mt-5 sm:mt-6 w-full max-w-lg px-2 sm:px-0 animate-fade-in">
          <div className="bg-white/90 backdrop-blur-sm border border-aqua/20 rounded-2xl px-4 sm:px-6 py-4 sm:py-5 shadow-glass text-sm sm:text-base leading-relaxed text-body text-center min-h-[3rem]">
            {caption}
            {isSpeaking && (
              <span className="inline-block w-0.5 h-4 sm:h-5 bg-aqua ml-0.5 align-middle animate-pulse" aria-hidden />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
