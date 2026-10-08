import { useState } from "react"
import { PublishIcon, ZapIcon } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { publishSite } from "@/lib/sites"
import type { BranchResource } from "@/lib/sites"

export function PublishModal({
  siteId,
  open,
  onOpenChange,
}: {
  siteId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [name, setName] = useState("main")
  const [tag, setTag] = useState("")
  const [target] = useState<"platform" | "zip">("platform")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BranchResource | null>(null)

  async function onPublish() {
    setBusy(true)
    setResult(null)
    try {
      const branch = await publishSite(siteId, { name, tag, target })
      setResult(branch)
    } catch (e) {
      setResult({ id: "", site: siteId, name, tag, status: "failed", target, result_url: "", error_log: String(e), created_at: "", published_at: null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PublishIcon className="size-4" />
            Publish branch
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {result === null ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="branch-name">Branch name</Label>
                <Input id="branch-name" value={name} onChange={e => setName(e.target.value)} placeholder="main" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-tag">Tag (optional)</Label>
                <Input id="branch-tag" value={tag} onChange={e => setTag(e.target.value)} placeholder="v1.0" />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ZapIcon className="size-3" />
                <span>Target: Platform hosting ({siteId}) — VPS + Cloudflare</span>
              </div>
            </>
          ) : (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <Badge variant={result.status === "published" ? "default" : result.status === "failed" ? "destructive" : "secondary"}>
                  {result.status}
                </Badge>
                <span className="text-sm font-medium">{result.name}</span>
              </div>
              {result.status === "published" && result.result_url && (
                <a href={result.result_url} className="text-sm underline underline-offset-2">Open site →</a>
              )}
              {result.status === "failed" && (
                <p className="text-xs text-destructive">{result.error_log || "Failed."}</p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            {result === null && (
              <Button onClick={onPublish} disabled={busy || !name.trim()}>
                {busy ? "Publishing…" : "Publish"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
