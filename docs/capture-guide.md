# Room photo guide

## Android

Open **Room photos & extraction** from the room menu. Use the camera or Android photo picker. JPG, PNG and WebP sources are bounded to 12 MB and 20 megapixels; smaller analysis copies keep review responsive. Originals and derived images are persisted in app document storage.

For fuller coverage, use roughly 6–12 overlapping views showing corners, openings, visible floor and furniture feet. Keep the furniture still and lighting even. Fewer photos, an empty room, denied permissions, or no detections still permit manual planning. Photos are not automatically fused into an accurate scan.

Configure a reachable analysis server in Settings, or leave it blank for offline planning. Requests are saved in an operation outbox and retry after connection recovery. Completed output is a proposal: review it explicitly before keeping observations or previews.

Correct masks with paint, erase, rectangle or numeric coordinates. Include furniture shadows when useful, but exclude windows and fixed features. Ignore false detections, add missed objects, and link another observation to an existing physical item instead of duplicating it. Only selected reviewed movable items are removed in a generated preview.

Dimensions begin as category defaults or placeholders. Enter known room/furniture measurements and review floor corners before judging fit. Learned metric depth is an optional inspection aid, not independent evidence that room dimensions or hidden boundaries are correct. The initial four floor corners are explicitly a review placeholder.

Generated empty-room pixels synthesize hidden surfaces. Refine the mask or continue with the editable procedural room when the restoration is poor. Preserve the original as evidence. Export a portable project package for a backup with its photos.

## Web companion

The browser photo importer accepts images under 8 MB and 20 megapixels. It stores embedded photos in browser localStorage, supports category-default extraction and optional analysis previews, and retains its legacy project format. Native identity review, durable jobs and file-backed media are part of the Android app; the web companion is not presented as having those native capabilities.
