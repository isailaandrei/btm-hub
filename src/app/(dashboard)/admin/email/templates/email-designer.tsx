"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Editor, ProjectData } from "grapesjs";
import {
  Heading,
  ImageIcon,
  Monitor,
  PanelBottom,
  PanelTop,
  RectangleHorizontal,
  SeparatorHorizontal,
  Smartphone,
  Tablet,
  Type,
} from "lucide-react";
import type { EmailAsset } from "@/types/database";
import {
  DEFAULT_DESIGNER_MJML,
  DESIGNER_BRAND,
  buildAssetImageBlockMjml,
  buildBrandFooterMjml,
  buildBrandHeaderMjml,
  buildButtonBlockMjml,
  buildDividerBlockMjml,
  buildHeroMjml,
  buildTextBlockMjml,
  normalizeGrapesMjml,
} from "./designer-helpers";

export interface EmailDesignerSnapshot {
  mjml: string;
  builderJson: Record<string, unknown>;
}

export interface EmailDesignerHandle {
  getSnapshot: () => EmailDesignerSnapshot;
  insertMjml: (mjml: string) => void;
  loadMjml: (mjml: string) => void;
}

interface EmailDesignerProps {
  assets: EmailAsset[];
  sourceMjml: string;
  onSourceMjmlChange: (mjml: string) => void;
}

function appendMjml(editor: Editor, mjml: string) {
  const wrapper = editor.getWrapper();
  const body = wrapper?.findFirstType("mj-body") ?? wrapper;
  body?.append(mjml);
}

function createSnapshot(editor: Editor): EmailDesignerSnapshot {
  return {
    mjml: normalizeGrapesMjml(editor.getHtml({ cleanId: true })),
    builderJson: {
      editor: "grapesjs-mjml",
      project: editor.getProjectData() as ProjectData,
    },
  };
}

export const EmailDesigner = forwardRef<EmailDesignerHandle, EmailDesignerProps>(
  function EmailDesigner({ assets, sourceMjml, onSourceMjmlChange }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const initialMjmlRef = useRef(sourceMjml);
    const [isReady, setIsReady] = useState(false);

    useImperativeHandle(ref, () => ({
      getSnapshot() {
        if (!editorRef.current) {
          return {
            mjml: normalizeGrapesMjml(
              initialMjmlRef.current || DEFAULT_DESIGNER_MJML,
            ),
            builderJson: { editor: "grapesjs-mjml", project: null },
          };
        }
        return createSnapshot(editorRef.current);
      },
      insertMjml(mjml: string) {
        if (!editorRef.current) return;
        appendMjml(editorRef.current, mjml);
        onSourceMjmlChange(createSnapshot(editorRef.current).mjml);
      },
      loadMjml(mjml: string) {
        if (!editorRef.current) return;
        const normalized = normalizeGrapesMjml(mjml);
        editorRef.current.setComponents(normalized);
        onSourceMjmlChange(normalized);
      },
    }), [onSourceMjmlChange]);

    useEffect(() => {
      let isMounted = true;

      async function initializeEditor() {
        if (!containerRef.current || editorRef.current) return;

        const [{ default: grapesjs }, { default: grapesJSMJML }] =
          await Promise.all([import("grapesjs"), import("grapesjs-mjml")]);

        if (!isMounted || !containerRef.current) return;

        const editor = grapesjs.init({
          container: containerRef.current,
          height: "680px",
          storageManager: false,
          fromElement: false,
          colorPicker: { appendTo: "parent" },
          assetManager: {
            upload: false,
            assets: assets.map((asset) => ({
              type: "image",
              src: asset.public_url,
              name: asset.original_filename,
            })),
          },
          plugins: [
            (currentEditor) =>
              grapesJSMJML(currentEditor, {
                blocks: [
                  "mj-1-column",
                  "mj-2-columns",
                  "mj-3-columns",
                  "mj-text",
                  "mj-button",
                  "mj-image",
                  "mj-divider",
                  "mj-spacer",
                  "mj-hero",
                ],
                fonts: {
                  Inter:
                    "https://fonts.googleapis.com/css?family=Inter:400,500,600,700",
                  Montserrat:
                    "https://fonts.googleapis.com/css?family=Montserrat:400,500,600,700",
                },
                imagePlaceholderSrc: assets[0]?.public_url ?? "",
                useXmlParser: true,
              }),
          ],
        });

        editor.setComponents(
          normalizeGrapesMjml(initialMjmlRef.current || DEFAULT_DESIGNER_MJML),
        );
        editor.on("component:update component:add component:remove", () => {
          onSourceMjmlChange(createSnapshot(editor).mjml);
        });
        editorRef.current = editor;
        setIsReady(true);
      }

      void initializeEditor();

      return () => {
        isMounted = false;
        editorRef.current?.destroy();
        editorRef.current = null;
      };
    }, [assets, onSourceMjmlChange]);

    function addBlock(mjml: string) {
      if (!editorRef.current) return;
      appendMjml(editorRef.current, mjml);
      onSourceMjmlChange(createSnapshot(editorRef.current).mjml);
    }

    function setDevice(device: "Desktop" | "Tablet" | "Mobile portrait") {
      editorRef.current?.setDevice(device);
    }

    return (
      <div className="rounded-md border border-border bg-background">
        <div className="border-b border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Visual designer
              </h3>
              <p className="text-xs text-muted-foreground">
                Build with branded MJML blocks, images, and mobile-safe sections.
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border p-1">
              <button
                type="button"
                onClick={() => setDevice("Desktop")}
                className="rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Desktop preview"
              >
                <Monitor className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setDevice("Tablet")}
                className="rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Tablet preview"
              >
                <Tablet className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setDevice("Mobile portrait")}
                className="rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Mobile preview"
              >
                <Smartphone className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addBlock(buildBrandHeaderMjml())}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <PanelTop className="h-4 w-4" />
              Add header
            </button>
            <button
              type="button"
              onClick={() => addBlock(buildHeroMjml())}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Heading className="h-4 w-4" />
              Add hero
            </button>
            <button
              type="button"
              onClick={() => addBlock(buildTextBlockMjml())}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Type className="h-4 w-4" />
              Add text
            </button>
            <button
              type="button"
              onClick={() => addBlock(buildButtonBlockMjml())}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <RectangleHorizontal className="h-4 w-4" />
              Add button
            </button>
            <button
              type="button"
              onClick={() => addBlock(buildDividerBlockMjml())}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <SeparatorHorizontal className="h-4 w-4" />
              Add divider
            </button>
            <button
              type="button"
              onClick={() => addBlock(buildBrandFooterMjml())}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <PanelBottom className="h-4 w-4" />
              Add footer
            </button>
          </div>

          {assets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {assets.slice(0, 6).map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => addBlock(buildAssetImageBlockMjml(asset))}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <ImageIcon className="h-4 w-4" />
                  Insert {asset.original_filename}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="email-designer-shell min-h-[680px]"
          style={{ ["--gjs-main-color" as string]: DESIGNER_BRAND.darkColor }}
        >
          {!isReady && (
            <div className="flex h-[680px] items-center justify-center text-sm text-muted-foreground">
              Loading visual designer...
            </div>
          )}
          <div ref={containerRef} className={isReady ? "block" : "hidden"} />
        </div>
      </div>
    );
  },
);
