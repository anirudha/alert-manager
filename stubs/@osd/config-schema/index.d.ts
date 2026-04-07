export declare const schema: {
  object(props: any, opts?: any): any;
  string(opts?: any): any;
  number(opts?: any): any;
  boolean(): any;
  maybe(s: any): any;
  literal(v: any): any;
  oneOf(arr: any[]): any;
  arrayOf(s: any): any;
  recordOf(keySchema: any, valueSchema: any, opts?: any): any;
  any(): any;
  uri(opts?: any): any;
};
