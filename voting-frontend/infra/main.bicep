targetScope = 'resourceGroup'

@description('Azure region for the website origin.')
param location string = resourceGroup().location

@description('Environment tag applied to every resource.')
@allowed([
  'development'
  'staging'
  'production'
])
param environment string = 'production'

// Storage account names must be globally unique, lowercase, and at most 24 characters.
var storageAccountName = 'alcweb${uniqueString(resourceGroup().id)}'
var staticWebAppName = 'alc-web-${uniqueString(resourceGroup().id)}'
var commonTags = {
  project: 'album-listening-club'
  environment: environment
  'managed-by': 'bicep'
}

resource websiteStorage 'Microsoft.Storage/storageAccounts@2025-08-01' = {
  name: storageAccountName
  location: location
  tags: commonTags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowCrossTenantReplication: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-08-01' = {
  name: 'default'
  parent: websiteStorage
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    staticWebsite: {
      enabled: true
      indexDocument: 'index.html'
      errorDocument404Path: 'index.html'
    }
  }
}

module staticWebApp 'br/public:avm/res/web/static-site:0.3.0' = {
  name: 'static-web-app'
  params: {
    name: staticWebAppName
    location: location
    sku: 'Free'
    tags: commonTags
  }
}

output storageAccountName string = websiteStorage.name
output staticWebsiteUrl string = websiteStorage.properties.primaryEndpoints.web
output staticWebAppName string = staticWebApp.outputs.name
output staticWebAppUrl string = 'https://${staticWebApp.outputs.defaultHostname}'
