// Deliberately references the whole environment object, so Vite inlines every
// variable it exposes. Any exposure caused by the real web config shows up here.
globalThis.__envProbe = JSON.stringify(import.meta.env);
