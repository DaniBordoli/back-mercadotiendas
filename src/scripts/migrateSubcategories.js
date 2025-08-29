const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');

// Conectar a MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI_DEV || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('No se encontró la URI de MongoDB en las variables de entorno');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
};

// Función principal de migración
const migrateSubcategories = async () => {
  try {
    console.log('🚀 Iniciando migración de subcategorías...');
    
    // 1. Buscar todas las categorías que tienen parent (son subcategorías)
    const subcategoriesData = await Category.find({
      parent: { $exists: true, $ne: null }
    }).lean();
    
    console.log(`📊 Encontradas ${subcategoriesData.length} subcategorías para migrar`);
    
    if (subcategoriesData.length === 0) {
      console.log('ℹ️  No hay subcategorías para migrar');
      return;
    }
    
    // 2. Procesar cada subcategoría
    const migratedSubcategories = [];
    
    for (const subcat of subcategoriesData) {
      try {
        // Extraer el ID de la categoría padre
        let parentId;
        if (typeof subcat.parent === 'string') {
          parentId = subcat.parent;
        } else if (subcat.parent.$oid) {
          parentId = subcat.parent.$oid;
        } else {
          parentId = subcat.parent.toString();
        }
        
        // Verificar que la categoría padre existe
        const parentCategory = await Category.findById(parentId);
        if (!parentCategory) {
          console.warn(`⚠️  Categoría padre ${parentId} no encontrada para subcategoría ${subcat.name}`);
          continue;
        }
        
        // Crear nueva subcategoría
        const newSubcategory = new Subcategory({
          name: subcat.name,
          description: subcat.description || '',
          category: parentId,
          isActive: true,
          order: 0
        });
        
        await newSubcategory.save();
        migratedSubcategories.push({
          oldId: subcat._id,
          newId: newSubcategory._id,
          name: subcat.name,
          parentCategory: parentCategory.name
        });
        
        console.log(`✅ Migrada: ${subcat.name} -> Categoría: ${parentCategory.name}`);
        
      } catch (error) {
        console.error(`❌ Error migrando subcategoría ${subcat.name}:`, error.message);
      }
    }
    
    console.log(`\n📈 Resumen de migración:`);
    console.log(`   - Subcategorías procesadas: ${subcategoriesData.length}`);
    console.log(`   - Subcategorías migradas exitosamente: ${migratedSubcategories.length}`);
    console.log(`   - Errores: ${subcategoriesData.length - migratedSubcategories.length}`);
    
    // 3. Mostrar resumen por categoría
    const groupedByCategory = migratedSubcategories.reduce((acc, sub) => {
      if (!acc[sub.parentCategory]) {
        acc[sub.parentCategory] = [];
      }
      acc[sub.parentCategory].push(sub.name);
      return acc;
    }, {});
    
    console.log(`\n📋 Subcategorías migradas por categoría:`);
    Object.entries(groupedByCategory).forEach(([category, subcategories]) => {
      console.log(`   ${category}:`);
      subcategories.forEach(sub => console.log(`     - ${sub}`));
    });
    
    console.log(`\n⚠️  IMPORTANTE: Después de verificar que todo funciona correctamente,`);
    console.log(`   puedes eliminar las subcategorías de la colección 'categories' manualmente.`);
    console.log(`   IDs a eliminar: ${migratedSubcategories.map(s => s.oldId).join(', ')}`);
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
  }
};

// Ejecutar migración
const runMigration = async () => {
  await connectDB();
  await migrateSubcategories();
  await mongoose.connection.close();
  console.log('\n🔌 Conexión cerrada');
  process.exit(0);
};

// Ejecutar si se llama directamente
if (require.main === module) {
  runMigration();
}

module.exports = { migrateSubcategories };