export class GenerationInputError extends Error {
  constructor() {
    super("Generation input is invalid.");
    this.name = "GenerationInputError";
  }
}
