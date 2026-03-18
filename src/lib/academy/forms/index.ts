// Re-export registry API
export { getFormDefinition, registerForm } from "./registry";

// Eagerly import all form modules so they self-register.
// IMPORTANT: Every file that calls getFormDefinition() must import from this
// barrel (not from ./registry directly) so the side-effect imports below run
// and the form definitions are available in the registry.
// Add new program form imports here as they are created.
import "./photography";
import "./filmmaking";
import "./freediving-modelling";
import "./internship";
