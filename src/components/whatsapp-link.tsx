import { whatsappLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.24 0 4.35.87 5.94 2.46a8.3 8.3 0 0 1 2.45 5.78c0 4.51-3.68 8.19-8.19 8.19a8.2 8.2 0 0 1-4.16-1.13l-.3-.17-3.12.82.83-3.04-.19-.31a8.18 8.18 0 0 1-1.27-4.4c0-4.51 3.68-8.2 8.01-8.2zm-3.29 4.36c-.16 0-.4.06-.62.31-.21.24-.82.8-.82 1.94 0 1.14.84 2.24.96 2.39.12.16 1.63 2.6 4.03 3.55 2 .78 2.4.63 2.83.59.43-.04 1.4-.57 1.6-1.13.2-.55.2-1.03.14-1.13-.06-.1-.22-.16-.46-.28-.25-.12-1.4-.7-1.62-.78-.22-.08-.38-.12-.53.12-.16.24-.6.78-.74.94-.14.16-.27.18-.51.06-.25-.12-1.04-.39-1.98-1.24-.73-.66-1.22-1.47-1.37-1.71-.14-.24-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.53-1.29-.74-1.77-.19-.46-.39-.4-.53-.4z" />
    </svg>
  );
}

// Renders a contact number as a wa.me deep link so a coach can tap straight
// into a WhatsApp chat. Falls back to plain text when the number is too
// short to be real (legacy placeholder values like "0").
export function WhatsAppLink({ contact, className }: { contact: string; className?: string }) {
  const href = whatsappLink(contact);
  if (!href) return <span className={className}>{contact}</span>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-[#25D366] underline-offset-2 hover:underline",
        className
      )}
    >
      <WhatsAppIcon className="size-3.5 shrink-0" />
      {contact}
    </a>
  );
}
