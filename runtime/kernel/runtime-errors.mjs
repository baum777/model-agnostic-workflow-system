class RuntimeBlockedError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'RuntimeBlockedError';
    this.status = 'blocked';
    this.issues = issues;
  }
}

class RuntimeFailedError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'RuntimeFailedError';
    this.status = 'failed';
    this.issues = issues;
  }
}

export { RuntimeBlockedError, RuntimeFailedError };
