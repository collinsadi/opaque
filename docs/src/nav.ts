export type NavItem = { to: string; label: string };

export type NavSection = { title: string; items: NavItem[] };

export const DOC_NAV: NavSection[] = [
  {
    title: "Introduction",
    items: [
      { to: "/", label: "Overview" },
      { to: "/install", label: "Installation" },
    ],
  },
  {
    title: "Unified SDK",
    items: [
      { to: "/sdk/quick-start", label: "Quick start" },
      { to: "/sdk/configuration", label: "Configuration" },
      { to: "/sdk/indexer", label: "Indexer format" },
      { to: "/sdk/api", label: "API reference" },
    ],
  },
  {
    title: "Guides",
    items: [
      { to: "/guides/register", label: "Register meta-address" },
      { to: "/guides/send", label: "Send & announce" },
      { to: "/guides/receive", label: "Receive & balances" },
      { to: "/guides/ghost", label: "Manual ghost receive" },
      { to: "/guides/sweep", label: "Spend & sweep" },
    ],
  },
  {
    title: "PSR (reputation)",
    items: [
      { to: "/guides/psr", label: "Overview" },
      {
        to: "/guides/psr/metadata-and-assignment",
        label: "Metadata & assignment prep",
      },
      { to: "/guides/psr/assign-transaction", label: "Assign reputation (announce)" },
      { to: "/guides/psr/discover-traits", label: "Discover traits" },
      { to: "/guides/psr/witness-json", label: "Witness JSON" },
      { to: "/guides/psr/stealth-signer-key", label: "Stealth signer key" },
      { to: "/guides/psr/generate-proof", label: "Generate proof & scope" },
      { to: "/guides/psr/reputation-roots", label: "Reputation Merkle roots" },
      { to: "/guides/psr/verify-on-chain", label: "Verify on-chain" },
    ],
  },
  /* Reference section hidden from nav; routes still work in App.tsx
  {
    title: "Reference",
    items: [
      { to: "/reference/modular", label: "Modular packages" },
      { to: "/reference/flows", label: "Flow explorer" },
    ],
  },
  */
  {
    title: "Tools",
    items: [{ to: "/playground", label: "Playground" }],
  },
];
