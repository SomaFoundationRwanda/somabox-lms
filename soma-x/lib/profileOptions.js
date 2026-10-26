// The answers people give about themselves, in one place: the profile form, the account page and
// the admin screens all use these lists and their words (shell.people.* in the language files).
// The backend accepts exactly these values (soma-x-backend/src/services/users.service.js).
export const GENDERS = ["male", "female", "other"];
export const ACCESS_NEEDS = ["none", "visual", "hearing", "mobility", "cognitive", "other"];

/** "Female", "Difficulty seeing (…)", or "Not specified" for no answer. */
export const genderLabel = (t, value) => (GENDERS.includes(value) ? t(`shell.people.genders.${value}`) : t("shell.people.notAnswered"));
export const accessLabel = (t, value) => (ACCESS_NEEDS.includes(value) ? t(`shell.people.access.${value}`) : t("shell.people.notAnswered"));
