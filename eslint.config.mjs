import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // The new React 19 hook lint flags any setState inside an effect body.
      // That covers a lot of legitimate patterns (fetch-on-mount, polling
      // setup, EULA gate) that are correct without being expressible as
      // pure derived state. Re-enable on a case-by-case basis if a specific
      // effect is actually causing cascading renders.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "design-lab/**"],
  },
];

export default config;
