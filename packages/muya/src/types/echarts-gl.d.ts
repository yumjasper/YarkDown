// `echarts-gl` ships no type declarations, and the package registers its
// charts/components as an import side effect, so the module is imported only
// for that effect — see `utils/diagram/echarts`.
declare module 'echarts-gl';
