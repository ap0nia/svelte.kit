# @svelte.kit/adapter-aws

## 0.5.0

### Minor Changes

- a2f4921: refactor: change outdirectory to specifically lambda or cloudfront directory instead of root of build/

## 0.4.3

### Patch Changes

- 4edd330: fix: function url output

## 0.4.2

### Patch Changes

- a37954d: feat: add more outputs to cdk
  fix: adapter-aws streamed response has to write empty string for empty response

## 0.4.1

### Patch Changes

- 8152439: fix: merge default build options

## 0.4.0

### Minor Changes

- 47bc10d: feat(adapter-aws): esbuild options
  feat(cdk): function or nullish values for construct prop overrides

## 0.3.0

### Minor Changes

- 0a3eeef: feat: updated aws adapter and cdk deployment

## 0.2.4

### Patch Changes

- 5ca7ad9: fix: cdk origin request policy hopefully

## 0.2.3

### Patch Changes

- d4ccbdc: feat: allow upload to lambda

## 0.2.2

### Patch Changes

- f07657e: feat: read non-conflicting static files to set as cloudfront origin

## 0.2.1

### Patch Changes

- 598496c: chore: remove id from start of construct names

## 0.2.0

### Minor Changes

- aecca6a: feat: configuration options for cdk package
  feat: documentation

## 0.1.5

### Patch Changes

- 95273e1: revert: origin group bad

## 0.1.4

### Patch Changes

- 3de6f88: fix: invalid status code for cloudfront

## 0.1.3

### Patch Changes

- 7b7d3c5: fix: too many status codes for cloudformation

## 0.1.2

### Patch Changes

- b1a8bd4: feat: use origin groups for cdk package
- 7e25fcd: feat: use origin group with fallback for cdk

## 0.1.1

### Patch Changes

- 5074712: chore: make sveltekit a CDK construct instead of a stack

## 0.1.0

### Minor Changes

- 0e2b8b9: feat: migrate to cloudfront centric deployment architecture
