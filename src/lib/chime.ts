// A short two-note chime synthesized with the Web Audio API, so check-in
// confirmation doesn't depend on shipping an audio asset.
export function playChime() {
  if (typeof window === "undefined") return;
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const notes = [880, 1318.5]; // A5, E6

  notes.forEach((freq, i) => {
    const start = ctx.currentTime + i * 0.12;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.32);
  });

  setTimeout(() => ctx.close(), 700);
}

// Uses the browser's built-in text-to-speech voice for now — swap in a real
// recorded clip later by playing an <audio> element here instead.
export function sayHappyBirthday(name: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(`Happy birthday, ${name}!`);
  utterance.pitch = 1.4;
  utterance.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
