import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { WHATS_NEW_ENTRIES } from "./whatsNew";

export function ReleaseNotesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Release notes</DialogTitle>
          <DialogDescription>
            What changed in this fork, including earlier versions.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="max-h-[min(32rem,70vh)] space-y-5 overflow-y-auto">
          {WHATS_NEW_ENTRIES.map((entry) => (
            <section key={entry.version} className="space-y-2">
              <h3 className="text-sm font-medium">{entry.title}</h3>
              <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {entry.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </section>
          ))}
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
