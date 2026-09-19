import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  settings: {} as typeof DEFAULT_UNIFIED_SETTINGS,
  update: vi.fn(),
  confirm: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("../../hooks/useSettings", () => ({
  usePrimarySettings: () => state.settings,
  useUpdatePrimarySettings: () => state.update,
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), Link: "a" }));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: string) => (atom === "providers" ? [] : null),
}));
vi.mock("../../state/server", () => ({
  primaryServerConfigAtom: "config",
  primaryServerObservabilityAtom: "observability",
  primaryServerProvidersAtom: "providers",
}));
vi.mock("../../state/environments", () => ({ usePrimaryEnvironmentId: () => null }));
vi.mock("../../state/entities", () => ({}));
vi.mock("../../state/desktopUpdate", () => ({}));
vi.mock("../../hooks/useThreadActions", () => ({}));
vi.mock("../../hooks/useCustomThemes", () => ({}));
vi.mock("../../hooks/useTheme", () => ({}));
vi.mock("../../hooks/useLocalStorage", () => ({}));
vi.mock("../../lib/archivedThreadsState", () => ({}));
vi.mock("../../env", () => ({ isElectron: false }));
vi.mock("../../branding", () => ({
  APP_VERSION: "test",
  HOSTED_APP_CHANNEL: null,
  HOSTED_APP_CHANNEL_LABEL: "test",
}));
vi.mock("../../localApi", () => ({
  readLocalApi: () => ({ dialogs: { confirm: state.confirm } }),
  ensureLocalApi: () => ({ dialogs: { confirm: state.confirm } }),
}));
vi.mock("../chat/ProviderModelPicker", () => ({ ProviderModelPicker: () => null }));
vi.mock("../chat/TraitsPicker", () => ({ TraitsPicker: () => null }));
vi.mock("../SidebarStageBackdrop", () => ({}));
vi.mock("../ProjectFavicon", () => ({}));
vi.mock("./ThemeSettings", () => ({}));
vi.mock("./SettingsFontPreviews", () => ({}));
vi.mock("./FontFamilyPicker", () => ({}));
vi.mock("./PanelAnimationsPreview", () => ({}));
vi.mock("./SharedSettingsMismatchAlert", () => ({ SharedSettingsMismatchAlert: () => null }));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/switch", () => ({ Switch: "input" }));
vi.mock("../ui/select", () => ({
  Select: "select",
  SelectTrigger: "div",
  SelectValue: "span",
  SelectPopup: "div",
  SelectItem: "option",
}));
vi.mock("../ui/collapsible", () => ({
  Collapsible: "div",
  CollapsibleTrigger: "button",
  CollapsiblePanel: "div",
}));
vi.mock("../ui/dialog", () => ({
  Dialog: () => null,
  DialogDescription: "div",
  DialogFooter: "div",
  DialogHeader: "div",
  DialogPanel: "div",
  DialogPopup: "div",
  DialogTitle: "div",
}));
vi.mock("../ui/tooltip", () => ({ Tooltip: "div", TooltipPopup: "div", TooltipTrigger: "div" }));
vi.mock("./settingsLayout", () => ({
  SETTINGS_PICKER_TRIGGER_CLASSNAME: "",
  useSettingsSearchTarget: () => null,
  useSettingsSearchTargetId: () => null,
  SettingsPageContainer: ({ children }: { children: ReactNode }) => children,
  SettingsSection: ({ children }: { children: ReactNode }) => children,
  PolicyTooltip: () => null,
  SettingResetButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button aria-label={`Reset ${label}`} onClick={onClick} />
  ),
  SettingsRow: ({
    id,
    children,
    control,
    resetAction,
  }: {
    id?: string;
    children?: ReactNode;
    control?: ReactNode;
    resetAction?: ReactNode;
  }) => (
    <section id={id}>
      {control}
      {resetAction}
      {children}
    </section>
  ),
}));

// Keep the real settingsSearch catalog: a stale row ID must fail this mounted test.
import { GeneralSettingsPanel } from "./SettingsPanels";

let renderer: ReactTestRenderer | null = null;
function streamingSelect() {
  return renderer!.root.findByProps({ id: "response-streaming" }).findByType("select");
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.settings = { ...DEFAULT_UNIFIED_SETTINGS };
  state.update.mockReset();
  state.confirm.mockReset().mockResolvedValue(false);
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});
function mount() {
  act(() => {
    renderer = create(<GeneralSettingsPanel />);
  });
}

describe("General Settings response streaming", () => {
  it("mounts the settings and legacy rows using the current catalog", () => {
    mount();
    expect(streamingSelect().props.value).toBe("paragraph");
    expect(renderer!.root.findByProps({ id: "legacy-plan-mode" })).toBeDefined();
  });
  it.each(["turn", "paragraph"])("saves %s without legacy confirmation", (mode) => {
    mount();
    act(() => streamingSelect().props.onValueChange(mode));
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ responseStreamingMode: mode });
    expect(state.confirm).not.toHaveBeenCalled();
  });
  it.each([false, true])("only enables token mode when confirmation is %s", async (confirmed) => {
    state.confirm.mockResolvedValue(confirmed);
    mount();
    await act(async () => {
      streamingSelect().props.onValueChange("token");
    });
    expect(state.confirm).toHaveBeenCalledOnce();
    if (confirmed)
      expect(state.update).toHaveBeenCalledExactlyOnceWith({ responseStreamingMode: "token" });
    else expect(state.update).not.toHaveBeenCalled();
  });
  it("restores paragraph streaming from token mode", () => {
    state.settings = { ...DEFAULT_UNIFIED_SETTINGS, responseStreamingMode: "token" };
    mount();
    act(() =>
      renderer!.root.findByProps({ "aria-label": "Reset response streaming" }).props.onClick(),
    );
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ responseStreamingMode: "paragraph" });
  });
});
