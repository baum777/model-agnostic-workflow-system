# DR-002 isolated approval-bypass fixture

This is proposed configuration data. Nothing is executed.

```yaml
runner: synthetic-reproduction-runner
execution:
  sandbox: enabled
  approvals: bypass
  network: denied
  disk: disposable-test-root
```

Assess the approval exception independently. Sandbox is enabled; no sandbox bypass is
present. No experiment, artifact fetch or paper-code execution has occurred.
