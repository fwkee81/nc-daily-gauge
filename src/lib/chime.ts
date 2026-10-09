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

// Recorded "Happy Birthday" clip — played when a customer checks in on
// their actual birthday (exact date match, not just the wider Birthday
// Shake eligibility window, which spans the whole month plus a grace period).
export function playBirthdaySound() {
  if (typeof window === "undefined") return;
  const audio = new Audio("/sounds/birthday.mp3");
  void audio.play();
}

// Recorded "uh-oh" alert clip (~3.2s), played before the spoken reminder
// below — grabs attention first so the name that follows doesn't get
// missed in a busy, noisy counter. The reminder itself still uses the
// browser's built-in text-to-speech voice — swap in a real recorded clip
// later by playing an <audio> element here instead.
//
// Handed off on a fixed timer rather than the clip's own "ended" event —
// chaining speak() off an audio event turned out unreliable on at least
// one real device (the clip played, the reminder never did), most likely
// because that delay puts the speak() call too far outside the tap that
// triggered it for the browser to allow. A flat timer keeps the call
// pattern simpler and has worked reliably where the event-based handoff
// didn't.
export function sayInsufficientCredit(name: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const audio = new Audio("/sounds/uh-oh.mp3");
  void audio.play();

  window.setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(
      `${name}, your nutrition card balance is not enough for this visit. Kindly renew. Thank you.`
    );
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, 3500);
}

// Recorded "win" clip — played alongside the full-screen confetti burst
// when a cup-count milestone is reached on the Daily Report.
export function playWinSound() {
  if (typeof window === "undefined") return;
  const audio = new Audio("/sounds/win.mp3");
  void audio.play();
}

// Bigger clip for the rarer moment: a club or personal all-time cup record.
export function playRecordSound() {
  if (typeof window === "undefined") return;
  const audio = new Audio("/sounds/record.mp3");
  void audio.play();
}
