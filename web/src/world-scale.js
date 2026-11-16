// Real-world scale standard, in metres. Mirrors Core WorldScale.cs and the "scale" block of data/village_shapes.json; web/test/world-scale.test.js keeps all three equal.
// Meshes are authored at 1 unit = 1 m and are placed at scale 1: a mesh may be shrunk to fit its cell but is never enlarged.
export const EYE_HEIGHT = 1.6;      // standing eye height of the explorer
export const PERSON_HEIGHT = 1.7;   // villagers and the explorer body
export const DOOR_HEIGHT = 2.0;
export const EAVES_MIN = 2.4;       // single storey eaves
export const EAVES_MAX = 3.2;
export const LAMP_MIN = 3.0;        // lamp post top
export const LAMP_MAX = 3.6;
export const TREE_MIN = 3.5;        // trees stand taller than people
export const STOREY_HEIGHT = 3.0;   // floor to floor; village houses are two storeys with an overhanging upper floor
export const HOUSE_STOREYS = 2;
export const RIDGE_MIN = 6.0;       // village house ridge, about 3.5 to 6 times a person
export const RIDGE_MAX = 10.0;
export const HOUSE_FOOTPRINT_MIN_CELLS = 2; // catalog footprint of a house, both axes
export const BODY_RADIUS = 0.45;    // explorer body: shoulders plus a held lantern, so the camera never sits in a wall face. Mirrors WorldScale.BodyRadius
export const VILLAGER_RADIUS = 0.35;   // a villager's body, no lantern held out. Mirrors WorldScale.VillagerRadius
export const OVERHANG_CLEARANCE = 0.15; // metres added to every side of a solid prop's collision box (eaves, thatch, branches). Mirrors WorldScale.OverhangClearance
export const MAX_PLACE_SCALE = 1;   // fitScale never enlarges a mesh
export const EYE_MIN = 1.5, EYE_MAX = 1.8;                    // eye height setting range of the first-person view
export const FOV_MIN_DEG = 55, FOV_MAX_DEG = 75, FOV_DEFAULT_DEG = 64; // vertical field of view setting range, degrees
