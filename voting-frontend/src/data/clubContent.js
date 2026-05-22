export const recentAlbums = [
  {
    id: "blonde",
    title: "Blonde",
    artist: "Frank Ocean",
    period: "Recently featured",
    coverClass: "cover-blonde",
    note: "A dense, emotional listen that turned into the longest post-club discussion of the month.",
  },
  {
    id: "currents",
    title: "Currents",
    artist: "Tame Impala",
    period: "Two weeks ago",
    coverClass: "cover-currents",
    note: "A polished psych-pop pick that gave the club a lighter, more immediate week.",
  },
  {
    id: "discovery",
    title: "Discovery",
    artist: "Daft Punk",
    period: "Three weeks ago",
    coverClass: "cover-discovery",
    note: "A high-energy choice that let newer members jump in without needing much context.",
  },
  {
    id: "ctrl",
    title: "Ctrl",
    artist: "SZA",
    period: "Last month",
    coverClass: "cover-ctrl",
    note: "A lyrical album that pulled conversation toward songwriting and sequencing.",
  },
  {
    id: "vespertine",
    title: "Vespertine",
    artist: "Björk",
    period: "Archive pick",
    coverClass: "cover-vespertine",
    note: "An intimate album that pulled the room toward texture, production, and close listening.",
  },
];

export const clubLinks = {
  discord: "#",
  instagram: "https://www.instagram.com/albumasu/",
  sunDevilCentral:
    "https://sundevilcentral.eoss.asu.edu/webapp/auth/login?redirect=%2FALC%2F&msg=LOGIN_REQUIRED",
};

export const homeActions = [
  {
    id: "vote",
    label: "Vote",
    title: "Weekly voting",
    description: "Nominate, narrow it down, and help choose what everyone listens to next.",
    kind: "route",
    target: "/vote",
  },
  {
    id: "join",
    label: "Join",
    title: "Sun Devil Central",
    description: "Join the club officially and get the real meeting details in one place.",
    kind: "external",
    target: "sunDevilCentral",
  },
  {
    id: "discord",
    label: "Discord",
    title: "Community chat",
    description: "The place for reminders, side conversations, and keeping up between meetings.",
    kind: "external",
    target: "discord",
  },
  {
    id: "events",
    label: "Events",
    title: "Special events",
    description: "Live concerts, volunteering, and occasional hangs beyond the weekly meeting.",
    kind: "anchor",
    target: "#events",
  },
];

export const instagramFeed = [
  { id: "post-1", label: "Meeting recap", coverClass: "feed-meeting" },
  { id: "post-2", label: "Album of the week", coverClass: "feed-album" },
  { id: "post-3", label: "Group listen", coverClass: "feed-listen" },
  { id: "post-4", label: "Event post", coverClass: "feed-event" },
  { id: "post-5", label: "Archive pick", coverClass: "feed-archive" },
  { id: "post-6", label: "Club moment", coverClass: "feed-club" },
];

export const specialEvents = [
  {
    id: "concerts",
    label: "Live concerts",
    title: "Group show nights",
    description: "Concert plans for members who want the club to leave the library.",
  },
  {
    id: "volunteering",
    label: "Volunteering",
    title: "Good hangs with a purpose",
    description: "Volunteer events that still feel social, low-pressure, and easy to join.",
  },
];

export const weeklyRhythm = [ //how club works section
  {
    step: "01",
    title: "Listen with intention",
    description:
      "The home page keeps the current album visible so members always know what the club is sitting with this week.",
  },
  {
    step: "02",
    title: "Open one clear ballot",
    description:
      "Voting lives on a dedicated page, which keeps the primary action obvious instead of hiding it inside a noisy feed.",
  },
  {
    step: "03",
    title: "Reset the cycle cleanly",
    description:
      "A new poll id creates a fresh ballot, so every week starts from a clean state without touching old results.",
  },
];

export const clubPrinciples = [
  {
    title: "Editorial, not chaotic",
    description:
      "The site is built to feel curated. Every section exists to reinforce the club rhythm instead of filling space.",
  },
  {
    title: "One ballot per poll",
    description:
      "Votes persist through refreshes in the browser, which makes the experience feel dependable even before a backend exists.",
  },
  {
    title: "Phase-ready structure",
    description:
      "The same vote page can handle nominations, primaries, or a final round by changing the poll configuration.",
  },
];

// need to update this object when a new weekly poll goes live.
export const currentPoll = {
  id: "2026-week-16-nominations",
  phase: "nominations",
  cycleLabel: "Week 16",
  status: "Open until nominations at Wednesday's club",
  question: "What did you think of this album? What should the club listen to next?",
  description:
    "Nomination week is open. Submit one album and artist pairing for the next club session.",
  albumOfWeek: {
    title: "Heaven or Las Vegas",
    artist: "Cocteau Twins",
    note: "Current club listen",
    coverClass: "cover-week",
  },
  candidates: [
    {
      id: "in-rainbows",
      title: "In Rainbows",
      artist: "Radiohead",
      note: "A warm, detailed record with a lot to unpack on repeat listens.",
    },
    {
      id: "vespertine",
      title: "Vespertine",
      artist: "Björk",
      note: "An intimate album that would push the club toward production-focused discussion.",
    },
    {
      id: "miseducation",
      title: "The Miseducation of Lauryn Hill",
      artist: "Lauryn Hill",
      note: "A bigger, high-consensus option that still leaves plenty of room for analysis.",
    },
  ],
};

export const phaseContent = { //given this phase what stuff should i show
  nominations: {
    label: "Nominations and Ratings",
    title: "Submit one album for the next round",
    description:
      "This phase collects fresh options. Each member gets one submission for the current poll id.",
    buttonLabel: "Lock in nomination",
  },
  primary: {
    label: "Primary Voting",
    title: "Choose from the top five nominations",
    description:
      "Duplicates are grouped together. The five most-nominated unique albums move into this ballot, with newest nominations breaking ties.",
    buttonLabel: "Cast primary vote",
  },
  final: {
    label: "Final Voting",
    title: "Choose next week's album",
    description:
      "Final voting is live. One selection from the shortlist decides the next club listen.",
    buttonLabel: "Submit final vote",
  },
};
