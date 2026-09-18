import { useEffect, useState } from "react";
import * as Schema from "effect/Schema";

import { APP_VERSION } from "../branding";
import { isElectron } from "../env";
import { getLocalStorageItem, setLocalStorageItem } from "../hooks/useLocalStorage";
import {
  resolveWhatsNewToShow,
  WHATS_NEW_STORAGE_KEY,
  type WhatsNewEntry,
} from "../whatsNew/whatsNew";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";

const LastSeenVersionSchema = Schema.String;

function readLastSeenVersion(): string | null {
  try {
    return getLocalStorageItem(WHATS_NEW_STORAGE_KEY, LastSeenVersionSchema);
  } catch {
    return null;
  }
}

function writeLastSeenVersion(version: string): void {
  try {
    setLocalStorageItem(WHATS_NEW_STORAGE_KEY, version, LastSeenVersionSchema);
  } catch {
    // A storage failure must not loop the dialog on every launch.
  }
}

export function WhatsNewDialog() {
  if (!isElectron) {
    return null;
  }
  return <WhatsNewDialogContent />;
}

function WhatsNewDialogContent() {
  const [entry, setEntry] = useState<WhatsNewEntry | null>(null);

  useEffect(() => {
    const next = resolveWhatsNewToShow({
      currentVersion: APP_VERSION,
      lastSeenVersion: readLastSeenVersion(),
    });
    setEntry(next);
  }, []);

  const dismiss = () => {
    writeLastSeenVersion(APP_VERSION);
    setEntry(null);
  };

  if (entry === null) {
    return null;
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry.title}</DialogTitle>
          <DialogDescription>
            T3 Code {entry.version} is installed. Here is what changed in this update.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <ul className="list-disc space-y-2 ps-5 text-sm">
            {entry.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" onClick={dismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
