/**
 * A central error logging utility designed to output clear, detailed 
 * error reports that can be easily copied and sent for debugging.
 */
export function logErrorReport(context: string, error: unknown) {
  console.error("\n==================== ERROR REPORT ====================");
  console.error(`Context: ${context}`);
  console.error(`Time:    ${new Date().toISOString()}`);
  
  if (error instanceof Error) {
    console.error(`Name:    ${error.name}`);
    console.error(`Message: ${error.message}`);
    console.error(`\nStack Trace:\n${error.stack}`);
    
    // Attempt to log cause if it exists (Error.cause)
    if (error.cause) {
      console.error(`\nCause:\n${error.cause}`);
    }
  } else {
    console.error(`Payload: ${JSON.stringify(error, null, 2)}`);
  }
  
  console.error("======================================================\n");
}
