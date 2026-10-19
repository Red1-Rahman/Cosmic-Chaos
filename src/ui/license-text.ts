// The licence text, read straight from the repository's LICENSE file at build
// time. It is imported raw rather than copied into a string constant so the
// screen can never drift from the file the project actually ships.
import licenseText from "../../LICENSE?raw";

/** The full Apache 2.0 licence, as it ships. */
export const LICENSE_TEXT: string = licenseText;

/** Header shown above the scrolling text. */
export const LICENSE_CAPTION = "Apache License 2.0, 2026 Redwan Rahman";

/** Key that closes the reader. */
export const LICENSE_EXIT_KEY = "Escape";

/** Seconds one full pass of the auto scroll takes. Matches the CSS animation. */
export const LICENSE_SCROLL_SECONDS = 46;
