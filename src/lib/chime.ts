// Plays the recorded check-in sound clip — loud and clear enough that a
// customer walking up to the counter hears the check-in succeeded.
export function playChime() {
  if (typeof window === "undefined") return;
  const audio = new Audio("/sounds/checkin.mp3");
  void audio.play();
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
