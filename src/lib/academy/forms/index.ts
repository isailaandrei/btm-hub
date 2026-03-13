// Re-export registry API
export { getFormDefinition, registerForm } from "./registry";

// Eagerly import all form modules so they self-register.
// Add new program form imports here as they are created.
import "./photography";
