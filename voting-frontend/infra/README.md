# Azure infrastructure

This directory defines the Album Listening Club production infrastructure with
Azure Bicep.

The infrastructure includes the original locally redundant StorageV2 website
and an Azure Static Web Apps Free instance for the production migration.
Cloudflare Free will provide CDN, WAF, DDoS mitigation, and rate limiting in
front of the Static Web App after the custom domain is connected.

## Validate without creating resources

```sh
az deployment group validate \
  --resource-group alc-prod \
  --template-file infra/main.bicep
```

## Preview Azure changes

```sh
az deployment group what-if \
  --resource-group alc-prod \
  --template-file infra/main.bicep
```

## Deploy after reviewing the preview

```sh
az deployment group create \
  --name alc-storage \
  --resource-group alc-prod \
  --template-file infra/main.bicep
```

Validation and `what-if` do not provision the declared resources. The `create`
command does.
