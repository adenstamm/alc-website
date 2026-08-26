export const SITE_ORIGIN = "https://albumasu.com";
export const SIDNEY_LETTER_ROUTE = "/for-sidney-7x4m9q";

export const ROUTE_META = {
  "/": {
    title: "Album Listening Club",
    description: "Album Listening Club at Arizona State University: current listens, upcoming sessions, archive browsing, and member voting.",
    heading: "Album Listening Club",
  },
  "/account": {
    title: "Account | Album Listening Club",
    description: "Sign in, create an Album Listening Club account, and check your membership status.",
    heading: "One pass for every side.",
    noIndex: true,
  },
  "/about": {
    title: "About | Album Listening Club",
    description: "Learn how Album Listening Club at Arizona State University listens, discusses, and votes together.",
    heading: "A club to meet people who love music just as much as you do",
  },
  "/admin": {
    title: "Admin | Album Listening Club",
    description: "Administration tools for Album Listening Club.",
    heading: "Voting control room.",
    noIndex: true,
  },
  "/archive": {
    title: "Archive | Album Listening Club",
    description: "Browse every album previously selected by Album Listening Club.",
    heading: "Every record already pulled from the shelf.",
  },
  "/current": {
    title: "Current Listen | Album Listening Club",
    description: "See the album Album Listening Club is currently listening to and find the next session.",
    heading: "The club's current listen",
  },
  "/confirm-signup": {
    title: "Confirm Email | Album Listening Club",
    description: "Confirm the email address associated with an Album Listening Club account.",
    heading: "One last step.",
    noIndex: true,
  },
  "/events": {
    title: "Events | Album Listening Club",
    description: "Find upcoming Album Listening Club sessions, record-store trips, concerts, and recent events.",
    heading: "Club plans beyond the weekly vote.",
  },
  "/genres": {
    title: "This Year in Genres | Album Listening Club",
    description: "Explore the upcoming genres shaping Album Listening Club's year of listening.",
    heading: "This is what this year will sound like.",
    noIndex: true,
  },
  "/privacy": {
    title: "Privacy | Album Listening Club",
    description: "Read how Album Listening Club uses account and membership information.",
    heading: "What the club account stores.",
  },
  "/reset-password": {
    title: "Reset Password | Album Listening Club",
    description: "Reset your Album Listening Club account password.",
    heading: "Reset your password.",
    noIndex: true,
  },
  [SIDNEY_LETTER_ROUTE]: {
    title: "For Sidney, With Love",
    description: "A private birthday letter for one wonderful person.",
    heading: "To the Wonderful Sidney",
    noIndex: true,
  },
  "/vote": {
    title: "Vote | Album Listening Club",
    description: "Nominate albums and cast your Album Listening Club ballot.",
    heading: "Vote on the club's next album",
  },
};

export const ROUTES = new Set(Object.keys(ROUTE_META));
export const NO_INDEX_ROUTES = new Set(
  Object.entries(ROUTE_META)
    .filter(([, meta]) => meta.noIndex)
    .map(([path]) => path),
);

export const NOT_FOUND_META = {
  title: "Page Not Found | Album Listening Club",
  description: "The requested Album Listening Club page could not be found.",
};
