// Picker copy. A teacher picks a class; "school" survives only where it names
// the administrator. The class is the tenant row until #99, and that mapping
// is recorded in `src/server/identity/GLOSSARY.md`.
export const membershipCopy = {
  eyebrow: "One more step",
  heading: "Choose your class",
  lede: "Your account belongs to more than one class. Pick the one you want to work in; you can sign in again to switch.",
  legend: "Class and role",
  note: "Cancelling forgets this pending choice. Nothing is shared with the classes you do not choose, and the pending link expires on its own after five minutes.",
  expiredHeading: "This sign-in expired",
  expiredLede:
    "Choosing a class has a five-minute window. Nothing was changed, so you can start again.",
  signInAgain: "Sign in again",
  pageTitle: "Choose your class | Edu-Canvas",
  errors: {
    rateLimited: {
      title: "Too many attempts",
      message:
        "Wait a few minutes before choosing a class again. If you are still blocked, contact your school administrator.",
    },
    unavailable: {
      title: "We could not confirm that choice",
      message: "The service is briefly unavailable. Try again in a moment.",
    },
    csrfRejected: {
      title: "This page needs to be reloaded",
      message:
        "For your safety we stopped that request. Reload the page and sign in again.",
    },
    classUnavailable: {
      title: "That class is not available for this sign-in",
      message:
        "Choose one of the classes listed for your account, or sign in again.",
    },
  },
} as const;
