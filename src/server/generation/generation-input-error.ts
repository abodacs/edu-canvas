export class GenerationInputError extends Error {
  constructor(
    message = "Generation input is invalid.",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "GenerationInputError";
  }
}
