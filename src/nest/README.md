# Nest (생명체 하우징)

An idle housing game: one hero creature lives on a tile lot with a yard and a house that grow over time.

## Play
- First visit: pick one of three hero candidates (fixed per account, so every device offers the same three) and name it.
- The lot starts at 32×32 tiles and grows by 4 rows/columns per expansion up to 64×64 (`expandCost`). Older 16×16 lots are read as 32×32.
- 마당 / 집 tabs: paint floors, draw walls along grid lines (wall, window, door), place yard things and furniture on tiles,
  select / drag / rotate / remove placed things. Doors let the hero through; walls and windows do not.
- The eye button lowers all walls to look inside the house (on by default in the 집 tab).
- The hero wanders with tile pathfinding (`findPath`) and finds one seed every 2 minutes; things with `yield` add more per hour.

## Data
- Supabase `nest_items` (`supabase/nest.sql`), never `hub_user_data.payload`: one `hero` row (id `hero`), one `land` row
  (id `land`: `size`, `floors` {"x,z": floor}, `walls` {"h:x,z" | "v:x,z": type}) and one `decor` row per placed thing.
- Local-first IndexedDB `hub-nest-v1`, the same store/sync/three-way merge as Contents (`store.js`), revision checks.
- Seeds are never stored: `seedBalance` = start + time-based earnings − what is built (removing something refunds it),
  so two devices can never disagree about a counter.
- Removing a thing only sets `deletedAt`. Never hard-delete rows or change field meanings; add fields and let `validateItem` fill defaults.
- Genes and `inheritGenes` stay in `model.js` for a later breeding feature.

## Rendering (`world.js`, `objects.js`, `person.js`, `toon.js`, `ink.js`)
three.js, loaded only when Nest opens. Sun shadow map (redrawn only after edits or camera moves; the hero uses a contact spot), instanced grass tufts and flowers, swaying leaves, drifting clouds, the hero is a slim person about 3.5 heads tall (`person.js`): body and head are a skinned model, `hero.glb`, generated in Blender by `tools/nest/hero_model.py` (run with Blender's Python module: `pip install bpy`), with face regions recoloured per look and the pose (walk swing, breathing, head tilt) set on its bones by `root.pose`; the face is a painted canvas texture from `face.js` on the head's front-projected UVs, hair is a smooth crown plus separate tapered locks per style that sway with `root.sway(t, walk, step)` by rewriting their vertices (each hero owns its lock geometry; `root.dispose()` frees it); look = skin/hair/hair colour/outfit/outfit colour/eyes in `hero.look`, free to change; heroes saved before looks get one fixed by `bornAt`), blinking, swinging arms and legs when walking, turning 3/4 to the viewer at rest; the pond is `pond.glb`, also built in Blender (`tools/nest/pond_model.py`: gradient water, foam, sandy shore, stones, lily pads, a lotus, reeds), dressed with game materials and small animations in `objects.js` (`MODEL_DRESSING`), with the old procedural pond as the fallback until it loads; `creature.js` keeps the old creature builder for later pets or breeding. Late-afternoon light (low honey sun, lavender sky fill, warm bounce) with a soft colour grade in the ink pass, 3D portraits (`portrait.js`). Orthographic camera (rotate in 90° steps, pan by drag, zoom by wheel/pinch/buttons),
toon gradient material, instanced floor tiles (flat tops only),
ink lines from a screen pass (`ink.js`): the scene is drawn once for colour (MSAA) and once into a float buffer of
normal, depth and an object/part code, then every pixel near a change of object, part, fold or real depth step is inked
at one fixed width, and FXAA smooths it. Tag nodes with `userData.inkKey` (share one object code), `inkSplit`
(each child its own object), `ink: false` (painted-on detail, no lines inside) or `inkSolid` (transparent but counted).
pixel ratio ≤ 1.5, 30 fps while moving / 12 fps when calm, paused when hidden or off screen.
