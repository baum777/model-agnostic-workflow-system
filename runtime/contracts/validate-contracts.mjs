function validateLoadedContracts(loadedContracts) {
  if (!loadedContracts?.ok) {
    return {
      ok: false,
      status: 'blocked',
      issues: loadedContracts?.issues ?? ['Runtime contracts were not loaded.']
    };
  }

  return {
    ok: true,
    status: 'completed',
    issues: []
  };
}

export { validateLoadedContracts };
