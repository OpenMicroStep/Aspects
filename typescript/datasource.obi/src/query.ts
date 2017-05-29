import {Aspect, DataSource, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, AComponent} from '@openmicrostep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlBinding, SqlMaker, SqlQuery, SqlQuerySharedContext} from '@openmicrostep/aspects.sql';
import {ObiDefinition, getOne, ObiDataSource} from './index.priv';


function mapIfExists<I, O>(arr: I[] | undefined, map: (v: I, idx: number) => O) : O[] | undefined {
  return arr ? arr.map(map) : undefined;
}

export function mapValue(def: ObiDefinition, ctx: ObiSharedContext, value, isId: boolean) {
  if (value instanceof VersionedObject) {
    value = value.id();
  }
  return value;
}

export type ObiSharedContext = ObiDataSource.Config & {
  cstor: { new(): ObiQuery },
  controlCenter: ControlCenter,
  maker: SqlMaker,
  systemObiByName: Map<string, ObiDefinition>,
  systemObiById: Map<number, ObiDefinition>,
  car_entityid: number,
  car_type: ObiDefinition,
  car_table: ObiDefinition,
  queries: Map<ObjectSet, ObiQuery>,
  aliases: number,
}
export namespace ObiQuery {
  export interface CarInfo {
    car: ObiDefinition;
    type: ObiDefinition;
    table: string;
    relation: boolean;
  }
}

function mk_car_info(ctx: ObiSharedContext, car: ObiDefinition, relation: boolean): ObiQuery.CarInfo {
  let type = car && getOne(car, ctx.car_type) as ObiDefinition;
  if (!type)
    throw new Error(`caracteristic ${car.system_name!} has no type`);
  let table = getOne(type, ctx.car_table, type.system_name!) as string;
  return {
    car: car,
    type: type,
    table: "TJ_VAL_" + table,
    relation: relation,
  };
}

export class ObiQuery extends SqlQuery<ObiSharedContext> {
  is?: ObiDefinition = undefined;
  _cstor?: Aspect.Constructor = undefined;

  setMapper(ctx: ObiSharedContext, name: string | undefined) {
    let is = name && ctx.systemObiByName.get(ctx.aspectClassname_to_ObiEntity(name));
    if (!is || this.is === is)
      return;

    this.is = is;
    this._cstor = ctx.controlCenter.aspect(name!);
    let alias = this.nextAlias(ctx);
    let table = "TJ_VAL_ID";
    this.path = { table: alias, key: "VAL_INST" };
    this.tables.set(JSON.stringify([is.system_name!]), alias);
    this.from.push(ctx.maker.from(table, alias));
    this.fromConditions.push(ctx.maker.op(ctx.maker.column(alias, "VAL_CAR"), ConstraintType.Equal, ctx.car_entityid));
    this.fromConditions.push(ctx.maker.op(ctx.maker.column(alias, "VAL"    ), ConstraintType.Equal, is._id));
  }

  aspect(ctx: ObiSharedContext) {
    return this._cstor!.aspect;
  }
  aspectAttribute(ctx: ObiSharedContext, attribute: string) {
    let a = this.aspect(ctx).attributes.get(attribute);
    if (!a)
      throw new Error(`aspect attribute ${attribute} not found in ${this._cstor!.name}`);
    return a;
  }

  cstor(ctx: ObiSharedContext) {
    return this._cstor!;
  }

  obiCar(ctx: ObiSharedContext, attribute: string) {
    return ctx.systemObiByName.get(ctx.aspectAttribute_to_ObiCar(this.is!.system_name!, attribute));
  }

  car_info(ctx: ObiSharedContext, attribute: string): ObiQuery.CarInfo {
    let car = this.obiCar(ctx, attribute);
    if (car) return mk_car_info(ctx, car, false);
    else {
      let a = this.aspectAttribute(ctx, attribute);
      if (a.relation) {
        let other_is_name = ctx.aspectClassname_to_ObiEntity(a.relation.class);
        let other_is = ctx.systemObiByName.get(other_is_name);
        if (!other_is)
          throw new Error(`obi ${other_is_name} not found`);
        let other_car = ctx.systemObiByName.get(ctx.aspectAttribute_to_ObiCar(other_is.system_name!, a.relation.attribute));
        if (!other_car)
          throw new Error(`caracteristic ${a.relation.attribute} not found`);
        return mk_car_info(ctx, other_car, true);
      }
    }
    throw new Error(`caracteristic ${attribute} not found`);
  }

  sqlColumn(ctx: ObiSharedContext, attribute: string, alias?: string) {
    let is = this.is!;
    if (attribute !== "_id") {
      let key = JSON.stringify([is.system_name!, attribute]);
      let table = this.tables.get(key);
      let car_info = this.car_info(ctx, attribute);
      if (!table) {
        table = this.nextAlias(ctx);
        this.tables.set(key, table);
        this.joins.push(ctx.maker.left_join(car_info.table, table, ctx.maker.and([
          ctx.maker.op(ctx.maker.column(table, "VAL_CAR" ), ConstraintType.Equal, car_info.car._id),
          ctx.maker.compare(ctx.maker.column(table, car_info.relation ? "VAL" : "VAL_INST"), ConstraintType.Equal, ctx.maker.column(this.path!.table, this.path!.key))
        ])));
      }
      return ctx.maker.column(table, car_info.relation ? "VAL_INST" : "VAL", alias);
    }
    else {
      return ctx.maker.column(this.path!.table, this.path!.key, alias);
    }
  }

  buildConstraintValue(ctx: ObiSharedContext, attribute: Aspect.InstalledAttribute, operator: DataSourceInternal.ConstraintOnValueTypes, value: any) : SqlBinding {
    if (operator === ConstraintType.Text && attribute.name === "_id") {
      // obi make full text search on the whole object attributes easy and fast
      let alias = this.nextAlias(ctx);
      this.joins.push(ctx.maker.left_join("TJ_VAL_STR", alias, ctx.maker.compare(ctx.maker.column(alias, "VAL_INST"), ConstraintType.Equal, ctx.maker.column(this.path!.table, this.path!.key))));
      return ctx.maker.op(ctx.maker.column(alias, "VAL"), ConstraintType.Text, value);
    }
    return super.buildConstraintValue(ctx, attribute, operator, value);
  }

  mapValue(ctx: ObiSharedContext, attribute: string, value) {
    if (value instanceof VersionedObject) {
      value = value.id();
    }
    if (attribute === "_id")
      return value;

    let aspect_attr = this.aspectAttribute(ctx, attribute);
    let car_info = this.car_info(ctx, attribute);
    return ctx.aspectValue_to_obiValue(aspect_attr, car_info, value);
  }
  
  async execute(ctx: ObiSharedContext, scope: string[], db: { select(sql_select: SqlBinding) : Promise<object[]> }, component: AComponent): Promise<VersionedObject[]> {
    const handle = (row, car_id2attribute: Map<number, string>, relation: boolean) => {
      let {_id, car_id, value, is} = row;
      let vo = cc.registeredObject(_id) || new cstor();
      let manager = vo.manager();
      let aspect = manager.aspect();
      let remoteAttributes = remotes.get(vo);
      if (!remoteAttributes) {
        remotes.set(vo, remoteAttributes = new Map());
        for (let a of aspectAttributes) {
          let d: undefined | Set<any> | any[] = undefined;
          if (a.type.type === "set")
            d = new Set();
          else if (a.type.type === "array")
            d = [];
          remoteAttributes.set(a.name, d);
        }
        remoteAttributes.set("_version", 0);
      }
      let car = ctx.systemObiById.get(car_id)!;
      let attr = car_id2attribute.get(car._id!)!;
      let aspectAttr = aspect.attributes.get(attr)!;
      value = ctx.obiValue_to_aspectValue(aspectAttr, mk_car_info(ctx, car, relation), value);
      cc.registerObjects(component, [vo]);
      manager.setId(_id);
      if (aspectAttr.type.type === "set" || aspectAttr.type.type === "array") {
        let c = remoteAttributes.get(attr);
        value = this.loadValue(ctx, component, aspectAttr.type.itemType, value, is);
        if (aspectAttr.type.type === "set")
          c.add(value);
        else // array
          c.push(value);
      }
      else {
        value = this.loadValue(ctx, component, aspectAttr.type, value, is);
        remoteAttributes.set(attr, value);
      }
    }

    let cstor = this.cstor(ctx);
    let attributes = ["_version", ...scope];
    let aspectAttributes = attributes.map(a => cstor.aspect.attributes.get(a)!);
    let query_instances = ctx.maker.select([ctx.maker.column(this.path!.table, this.path!.key, "_id")], this.sql_from(ctx), this.sql_join(ctx), this.sql_where(ctx));
    let rows_intances = await db.select(query_instances);
    if (rows_intances.length === 0)
      return [];
    let ids = new Set<number>();
    let tables = new Map<string, number[]>();
    let car_id2attribute = new Map<number, string>();
    let rel_tables = new Map<string, number[]>();
    let rel_car_id2attribute = new Map<number, string>();
    let remotes = new Map<VersionedObject, Map<string, any>>();
    let cc = ctx.controlCenter;

    for (let row of rows_intances)
      ids.add(row["_id"]);
    for (let attribute of attributes) {
      let car = ctx.systemObiByName.get(ctx.aspectAttribute_to_ObiCar(this.is!.system_name!, attribute));
      if (car) {
        add_car(ctx, tables, car_id2attribute, car, attribute, false);
      }
      else {
        let a = cstor.aspect.attributes.get(attribute);
        if (a && a.relation) {
          let other_is_name = ctx.aspectClassname_to_ObiEntity(a.relation.class);
          let other_is = ctx.systemObiByName.get(other_is_name);
          if (!other_is)
            throw new Error(`obi ${other_is_name} not found`);
          let other_car = ctx.systemObiByName.get(ctx.aspectAttribute_to_ObiCar(other_is.system_name!, a.relation.attribute));
          if (!other_car)
            throw new Error(`caracteristic ${a.relation.attribute} not found`);
          add_car(ctx, rel_tables, rel_car_id2attribute, other_car, attribute, true);
        }
        else
          throw new Error(`caracteristic ${attribute} not found`);
      }
    }
    // Load attributes that are directly on the object
    for (let [table, car_ids] of tables) {
      let query = mk_query(ctx, table, "VAL_INST", "VAL", ids, car_ids);
      let rows = await db.select(query);
      for (let row of rows)
        handle(row, car_id2attribute, false);
    }
    // Load attributes that are a relation
    for (let [table, car_ids] of rel_tables) {
      let query = mk_query(ctx, table, "VAL", "VAL_INST", ids, car_ids);
      let rows = await db.select(query);
      for (let row of rows)
        handle(row, rel_car_id2attribute, true);
    }
    return this.mergeRemotes(remotes);
  }

  loadValue(ctx: ObiSharedContext, component: AComponent, type: Aspect.Type, value, is: number | undefined) {
    if (typeof is === "number") {
      let subid = value;
      value = ctx.controlCenter.registeredObject(subid);
      if (!value) {
        let obi_is = ctx.systemObiById.get(is)!;
        let classname = ctx.obiEntity_to_aspectClassname(obi_is.system_name!);
        value = new (ctx.controlCenter.aspect(classname)!)();
        value.manager().setId(subid);
        ctx.controlCenter.registerObjects(component, [value]);
      }
    }
    return value;
  }
}

function add_car(ctx: ObiSharedContext, tables: Map<string, number[]>, car_id2attribute: Map<number, string>, car: ObiDefinition, attribute: string, relation: boolean) {
  let car_info = mk_car_info(ctx, car, relation);
  let t = tables.get(car_info.table);
  if (!t)
    tables.set(car_info.table, t = []);
  t.push(car_info.car._id!);
  car_id2attribute.set(car_info.car._id!, attribute);
}

function mk_query(ctx: ObiSharedContext, table: string, id_column: string, val_column: string, ids: Iterable<number>, car_ids: number[]) {
  let columns = [
    ctx.maker.column(table, id_column , "_id"   ),
    ctx.maker.column(table, "VAL_CAR" , "car_id"),
    ctx.maker.column(table, val_column, "value" ),
  ];
  let from = [ctx.maker.from(table)];
  let and = [
    ctx.maker.op(ctx.maker.column(table, id_column), ConstraintType.In, [...ids]),
    ctx.maker.op(ctx.maker.column(table, "VAL_CAR"), ConstraintType.In, car_ids),
  ];
  if (table === "TJ_VAL_ID") {
    columns.push(ctx.maker.column("AIS", "VAL", "is"));
    from.push(ctx.maker.from("TJ_VAL_ID", "AIS"));
    and.push(ctx.maker.compare(ctx.maker.column("AIS", "VAL_INST"), ConstraintType.Equal, ctx.maker.column(table, val_column)))
    and.push(ctx.maker.op(ctx.maker.column("AIS", "VAL_CAR"), ConstraintType.Equal, ctx.car_entityid))
  }
  let query = ctx.maker.select(columns, from, [], ctx.maker.and(and));
  return query;
}