import type { Contact } from "@/types/database";
import type { ContactListApplication } from "@/lib/admin/contacts/application-projection";

/**
 * Whether a contact matches the contacts-panel search box.
 *
 * Always matches `name` or `email` as a case-insensitive substring. When the
 * query is phone-like (contains digits and no letters), it additionally matches
 * on a digits-only comparison against the contact's `phone` column and any
 * application `answers.phone` — mirroring the phone the contacts UI shows
 * (latest application phone, falling back to `contact.phone`).
 *
 * The digits-only comparison ignores formatting (spaces, "+", dashes, parens),
 * so "0712 345 678" matches a stored "+40712345678"-style value. The no-letters
 * guard keeps a name search such as "anna 1" from substring-matching every phone
 * that happens to contain "1".
 */
export function contactMatchesSearch(
  contact: Pick<Contact, "name" | "email" | "phone">,
  applications: ContactListApplication[],
  search: string,
): boolean {
  const query = search.toLowerCase();

  if (
    contact.name.toLowerCase().includes(query) ||
    contact.email.toLowerCase().includes(query)
  ) {
    return true;
  }

  const phoneQuery = query.replace(/\D/g, "");
  const isPhoneSearch = phoneQuery.length > 0 && !/[a-z]/i.test(query);
  if (!isPhoneSearch) return false;

  const candidatePhones: Array<string | null | undefined> = [
    contact.phone,
    ...applications.map(
      (application) => application.answers.phone as string | undefined,
    ),
  ];

  return candidatePhones.some(
    (phone) =>
      typeof phone === "string" &&
      phone.replace(/\D/g, "").includes(phoneQuery),
  );
}
