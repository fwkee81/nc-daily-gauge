// Builds a wa.me deep link from a stored contact number. Numbers in this app
// are entered as local Malaysian mobile numbers (leading 0), so a bare
// "0123456789" needs the 60 country code substituted in for wa.me to accept
// it. Returns null for anything too short to be a real number (placeholder
// values like "0" from legacy walk-in records — see isRealContact in
// checkin/walkin-dialog.tsx for the same guard applied elsewhere).
export function whatsappLink(contact: string): string | null {
  const digits = contact.replace(/\D/g, "");
  if (digits.length < 8) return null;

  const withCountryCode = digits.startsWith("60")
    ? digits
    : digits.startsWith("0")
      ? `60${digits.slice(1)}`
      : `60${digits}`;

  return `https://wa.me/${withCountryCode}`;
}
