# SF_028 DELETE OLD ROOT READY REPORT

- Run ID: `SF028_ACTIVE_CORE_20260801_142027`
- OLD_ROOT: `D:\SOURCE FACTORY`
- NEW_ROOT: `E:\SOURCE FACTORY\source-factory-active-core`
- OLD_ROOT deleted: **false**
- DELETE_OLD_ROOT_READY: **false**

## Gate evidence

1. Required files present: `False`
2. Manifest SHA-256 match: `True`
3. Python py_compile: `True`
4. JSON parse: `True`
5. JavaScript syntax: `True`
6. Forbidden copied paths: `0`
7. Install package seed present: `True`
8. Runtime dependencies: `INSTALL_REQUIRED`
9. Runtime launch ready now: `False`

`DELETE_OLD_ROOT_READY=true` means the active-core source and install seed passed the migration gate. The worker does not delete OLD_ROOT. Commander approval remains required. Because `node_modules` is intentionally excluded, runtime launch requires the generated dependency-install step unless dependencies are already installed separately.
