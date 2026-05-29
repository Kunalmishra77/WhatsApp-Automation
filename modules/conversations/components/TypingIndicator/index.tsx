export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border bg-card px-3.5 py-3 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
            style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.9s' }}
          />
        ))}
      </div>
    </div>
  );
}
