import {Sequelize, SequelizeDataSource} from '@openmicrostep/aspects.sequelize';
export const dataSource = new SequelizeDataSource();
dataSource.define(Heroe);
