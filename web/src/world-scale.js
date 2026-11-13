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
export const MAX_PLACE_SCALE = 1;   // fitScale never enlarges a mesh
