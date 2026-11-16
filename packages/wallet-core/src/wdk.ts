// Heavy entry: WDK and every wallet module. Browsers should load it lazily.
export * from './create-wdk.ts'
export { default as WDK } from '@tetherto/wdk'
