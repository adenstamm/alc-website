# Azure infrastructure

This directory defines the Album Listening Club production infrastructure with
Azure Bicep.

The infrastructure includes the original locally redundant StorageV2 website
and an Azure Static Web Apps Free instance for the production migration.
Cloudflare Free will provide the public DNS, CDN, TLS, and edge security layer
after the custom domain is connected. Azure Static Web Apps Free does not
support origin IP allowlisting, so the Azure-generated hostname remains a
second public route to the app unless the service plan changes.

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
