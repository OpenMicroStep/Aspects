import {Sequelize, SequelizeDataSource} from '@microstep/aspects.sequelize';
export const dataSource = new SequelizeDataSource();
dataSource.define(Heroe);