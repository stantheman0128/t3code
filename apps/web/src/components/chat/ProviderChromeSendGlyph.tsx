/** Stroke arrow matches the default T3 send control. Filled arrow is for Codex/Claude chrome. */
export function ProviderChromeSendGlyph() {
  return (
    <>
      <svg
        data-chrome-send="stroke"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        data-chrome-send="filled"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7.02 2.15c.28 0 .52.14.66.38l4.28 7.22A.78.78 0 0 1 11.28 11H2.72a.78.78 0 0 1-.68-1.25l4.28-7.22a.78.78 0 0 1 .7-.38Z"
          fill="currentColor"
        />
      </svg>
    </>
  );
}
