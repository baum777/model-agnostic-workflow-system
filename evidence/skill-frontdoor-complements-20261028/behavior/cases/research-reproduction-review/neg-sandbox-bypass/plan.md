# DR-002 isolated sandbox-bypass fixture

This is proposed configuration data. Nothing is executed.

```yaml
runner: synthetic-reproduction-runner
execution:
  sandbox: disabled
  approvals: required
  network: denied
  disk: disposable-test-root
```

Assess the sandbox exception independently. Approval remains required; no approval bypass
is present. No experiment, artifact fetch or paper-code execution has occurred.
