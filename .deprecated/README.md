# Archived files

These files are historical references, not active application code or supported startup configurations. They are excluded from the web TypeScript project and Docker build context. No private environment files are stored here.

| Archived path | Why it was moved | Current replacement |
| --- | --- | --- |
| `src/components/editor/{FurnitureTray,ItemInspector,Toolbar,ViewModeSwitch}.tsx` | No active imports; superseded editor UI | `app/editor/[id]/page.tsx` and `src/components/editor/panels/` |
| `src/components/ui/{BottomSheet,Tooltip,ColorPicker,Input,Slider,Button}.tsx` | Used only by the retired editor, or unused | Current editor panels and active UI components |
| `docker-compose.yml` | Earlier web/vision-only stack | Root `docker-compose.yml` |
| `docker-compose.{platform,app,supabase}.yml` | Multiple overlapping startup configurations | Root `docker-compose.yml`, with Supabase Storage |
| `infra/s3.local.json` | Demo SeaweedFS credentials; Supabase is now the default | Root `.env` Supabase API settings |

Original relative paths are retained for reference. Archived files are not drop-in runnable from this directory. Restore and review their imports/configuration before reuse.

The duplicate environment templates were removed. The single active environment file is the ignored root `.env`; a clean-checkout template lives in `RUNNING.md`.

`packages/backend/src/media-s3.ts` preserves the earlier S3 adapter. The active adapter now uses the three Supabase API settings directly.
