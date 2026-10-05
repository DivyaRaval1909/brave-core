
import { PolkadotBridgeReceiver, PolkadotBridgeUIHandler, PolkadotBridgeInterface, PolkadotDecodedPayload } from 'gen/brave/components/brave_wallet/common/polkadot_bridge.mojom.m.js'

import {
  TypeRegistry,
  Metadata,
} from '@polkadot/types'
import { allExtensions } from '@polkadot/types/extrinsic/signedExtensions'

type HexString = `0x${string}`;

export interface SignerPayloadJSON {
  address: string;
  assetId?: HexString;
  blockHash: HexString;
  blockNumber: HexString;
  era: HexString;
  genesisHash: HexString;
  metadataHash?: HexString;
  method: string;
  mode?: number;
  nonce: HexString;
  specVersion: HexString;
  tip: HexString;
  transactionVersion: HexString;
  signedExtensions: string[];
  version: number;
  withSignedTransaction?: boolean;
}

const FAKE_SIGNATURE = new Uint8Array(256).fill(1)

function buildMockExtrinsic(registry: TypeRegistry, payload: SignerPayloadJSON) {
  const extrinsic = registry.createType(
    'Extrinsic',
    { method: payload.method },
    { version: payload.version },
  )

  return extrinsic.addSignature(payload.address, FAKE_SIGNATURE, payload)
}

function applyExtensionTypes(registry: TypeRegistry, metadata: Metadata) {
  const identifiers = []
  const userExtensions: Record<string, any> = {}
  const derived = []

  for (const { identifier, type } of metadata.asLatest.extrinsic.transactionExtensions) {
    const name = identifier.toString()
    identifiers.push(name)

    if (!allExtensions[name]) {
      const typeName = registry.createLookupType(type)
      userExtensions[name] = { extrinsic: { [name]: typeName }, payload: {} }
      derived.push(`${name}: ${registry.lookup.getName(type) || typeName}`)
    }
  }

  registry.setSignedExtensions(identifiers, userExtensions)
  return derived
}

const setupPolkadotBridge = () => {
  const uiHandler = PolkadotBridgeUIHandler.getRemote()
  uiHandler.bindPolkadotBridge(receiver.$.bindNewPipeAndPassRemote())
}


class PolkadotBridge implements PolkadotBridgeInterface {
  async decode(
    metadataBytes: number[],
    rawPayloadJson: string,
  ): Promise<{ decoded: PolkadotDecodedPayload | null }> {
    try {
      // console.log('going to parse json payload now...')
      // console.log(rawPayloadJson)
      const payload: SignerPayloadJSON = JSON.parse(rawPayloadJson);

      console.log(payload);

      const registry = new TypeRegistry()
      console.log(registry)
      const metadata = new Metadata(registry, new Uint8Array(metadataBytes))
      registry.setMetadata(metadata)
      applyExtensionTypes(registry, metadata)

      console.log('constructed full type registry')

      const call = registry.createType('Call', payload.method)
      const extrinsic = buildMockExtrinsic(registry, payload)

      // console.log('going to return the following:')
      const asHuman = JSON.stringify(call.toHuman())
      const mockSignedExtrinsic = Array.from(extrinsic.toU8a())
      // console.log(asHuman)
      // console.log(mockSignedExtrinsic)

      return {
        decoded: {
          asHuman,
          mockSignedExtrinsic,
          error: '',
        },
      }
    } catch(e) {
      console.error('polkadot bridge decode failed', e)
      return {
        decoded: {
          asHuman: undefined,
          mockSignedExtrinsic: undefined,
          error: e instanceof Error
            ? `${e.name}: ${e.message}\n${e.stack ?? ''}`
            : String(e),
        }
      }
    }
  }
}

const bridge = new PolkadotBridge()
const receiver = new PolkadotBridgeReceiver(bridge)

setupPolkadotBridge();
