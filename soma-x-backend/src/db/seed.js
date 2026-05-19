import bcrypt from 'bcrypt';
import { serverDb, localDb } from '../helpers/db-manager.js';

const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
};

async function seedDatabase() {
    console.log('Starting database seed...');

    // Clear existing data (except schema)
    console.log('Clearing existing data...');
    serverDb.exec('DELETE FROM content_items;');
    serverDb.exec('DELETE FROM categories;');
    serverDb.exec('DELETE FROM users;');
    serverDb.exec('DELETE FROM books;');
    localDb.exec('DELETE FROM content_items;');
    localDb.exec("DELETE FROM categories WHERE path_key != 'custom-content';");

    // ============================================
    // 1. SEED USERS
    // ============================================
    console.log('Seeding users...');
    const adminHash = await hashPassword('admin123');
    const teacherHash = await hashPassword('teacher123');
    
    serverDb.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run('admin@somabox.com', adminHash, 'admin');
    serverDb.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run('teacher@somabox.com', teacherHash, 'teacher');
    serverDb.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run('john.admin@somabox.com', adminHash, 'admin');
    serverDb.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run('mary.teacher@somabox.com', teacherHash, 'teacher');
    
    console.log('Created 4 users');

    // ============================================
    // 2. SEED MAIN CATEGORIES
    // ============================================
    console.log('Seeding categories...');
    
    const rwandanEduId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Rwandan Education', 'Local curriculum content', null, 'rwandan-education', 1, 0).lastInsertRowid;
    
    const intlEduId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('International Education', 'Global learning resources', null, 'international-education', 1, 0).lastInsertRowid;
    
    const schoolContentId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('School Content', 'Custom school materials', null, 'school-content', 1, 0).lastInsertRowid;

    // ============================================
    // 3. SEED RWANDAN EDUCATION SUBCATEGORIES
    // ============================================
    const nurseryId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Nursery School', 'Early childhood education', rwandanEduId, 'rwandan-education/nursery-school-content', 0, 0).lastInsertRowid;
    
    const primaryId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Primary School', 'Primary level curriculum', rwandanEduId, 'rwandan-education/primary-school-content', 0, 0).lastInsertRowid;
    
    const secondaryId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Secondary School', 'Secondary level curriculum', rwandanEduId, 'rwandan-education/secondary-school-content', 0, 0).lastInsertRowid;
    
    const universityId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('University Level', 'Higher education resources', rwandanEduId, 'rwandan-education/university-content', 0, 0).lastInsertRowid;

    // Nursery subcategories (Video, Book, Audio)
    const nurseryVideoId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Video', 'Video lessons', nurseryId, 'rwandan-education/nursery-school-content/video', 0, 0).lastInsertRowid;
    
    const nurseryBookId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Book', 'Educational books', nurseryId, 'rwandan-education/nursery-school-content/book', 0, 0).lastInsertRowid;
    
    const nurseryAudioId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Audio', 'Audio lessons', nurseryId, 'rwandan-education/nursery-school-content/audio', 0, 0).lastInsertRowid;

    // Primary subcategories
    const primaryVideoId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Video', 'Video lessons', primaryId, 'rwandan-education/primary-school-content/video', 0, 0).lastInsertRowid;
    
    const primaryBookId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Book', 'Educational books', primaryId, 'rwandan-education/primary-school-content/book', 0, 0).lastInsertRowid;

    // Secondary subcategories
    const secondaryVideoId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Video', 'Video lessons', secondaryId, 'rwandan-education/secondary-school-content/video', 0, 0).lastInsertRowid;
    
    const secondaryBookId = serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Book', 'Educational books', secondaryId, 'rwandan-education/secondary-school-content/book', 0, 0).lastInsertRowid;

    // ============================================
    // 4. SEED INTERNATIONAL EDUCATION SUBCATEGORIES
    // ============================================
    serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('W3Schools', 'Web development tutorials', intlEduId, 'international-education/w3schools', 0, 0);
    
    serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Wikipedia', 'Encyclopedia', intlEduId, 'international-education/wikipedia', 0, 0);
    
    serverDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Kolibri', 'Interactive learning platform', intlEduId, 'international-education/kolibri', 0, 0);

    console.log('Created category structure');

    // ============================================
    // 5. SEED CONTENT ITEMS
    // ============================================
    console.log('Seeding content items...');
    
    const insertContent = serverDb.prepare(`
        INSERT INTO content_items (category_id, title, subtitle, type, url, path_key, size, duration, pages, is_disabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    // Nursery Videos
    const nurseryVideos = [
        { title: 'Colors and Shapes', subtitle: 'Learning basic colors and shapes', duration: 15 },
        { title: 'Numbers 1 to 10', subtitle: 'Counting basics for young learners', duration: 12 },
        { title: 'Animal Sounds', subtitle: 'Fun with animal sounds and names', duration: 18 },
        { title: 'Alphabet Song', subtitle: 'Learn the alphabet through song', duration: 8 },
        { title: 'Good Manners', subtitle: 'Introduction to polite behavior', duration: 10 }
    ];

    nurseryVideos.forEach((video, i) => {
        const pathKey = `rwandan-education/nursery-school-content/video/${video.title.toLowerCase().replace(/\s+/g, '-')}.mp4`;
        insertContent.run(
            nurseryVideoId,
            video.title,
            video.subtitle,
            'video',
            `/${pathKey}`,
            pathKey,
            Math.floor(Math.random() * 50000000) + 10000000,
            video.duration,
            null
        );
    });

    // Nursery Books
    const nurseryBooks = [
        { title: 'My First Words', subtitle: 'Picture dictionary for toddlers', pages: 24 },
        { title: 'The Big Red Dog', subtitle: 'A story about friendship', pages: 16 },
        { title: 'Colors All Around', subtitle: 'Exploring colors in nature', pages: 20 },
        { title: 'Count with Me', subtitle: 'Numbers and counting fun', pages: 18 }
    ];

    nurseryBooks.forEach((book, i) => {
        const pathKey = `rwandan-education/nursery-school-content/book/${book.title.toLowerCase().replace(/\s+/g, '-')}.pdf`;
        insertContent.run(
            nurseryBookId,
            book.title,
            book.subtitle,
            'book',
            `/${pathKey}`,
            pathKey,
            Math.floor(Math.random() * 5000000) + 1000000,
            null,
            book.pages
        );
    });

    // Primary Videos
    const primaryVideos = [
        { title: 'Introduction to Mathematics', subtitle: 'Basic arithmetic operations', duration: 25 },
        { title: 'Science: Water Cycle', subtitle: 'Understanding the water cycle', duration: 20 },
        { title: 'English Grammar Basics', subtitle: 'Parts of speech introduction', duration: 30 },
        { title: 'History of Rwanda', subtitle: 'Early civilization and culture', duration: 35 },
        { title: 'Geography: Continents', subtitle: 'Exploring the seven continents', duration: 28 },
        { title: 'Simple Machines', subtitle: 'Levers, pulleys, and wheels', duration: 22 }
    ];

    primaryVideos.forEach((video, i) => {
        const pathKey = `rwandan-education/primary-school-content/video/${video.title.toLowerCase().replace(/\s+/g, '-')}.mp4`;
        insertContent.run(
            primaryVideoId,
            video.title,
            video.subtitle,
            'video',
            `/${pathKey}`,
            pathKey,
            Math.floor(Math.random() * 80000000) + 20000000,
            video.duration,
            null
        );
    });

    // Primary Books
    const primaryBooks = [
        { title: 'Mathematics Grade 4', subtitle: 'Complete mathematics curriculum', pages: 156 },
        { title: 'English Reader Level 3', subtitle: 'Stories and comprehension', pages: 120 },
        { title: 'Science Experiments', subtitle: 'Hands-on activities for primary students', pages: 88 },
        { title: 'Social Studies', subtitle: 'Communities and cultures', pages: 92 },
        { title: 'Kinyarwanda Grammar', subtitle: 'Language fundamentals', pages: 104 }
    ];

    primaryBooks.forEach((book, i) => {
        const pathKey = `rwandan-education/primary-school-content/book/${book.title.toLowerCase().replace(/\s+/g, '-')}.pdf`;
        insertContent.run(
            primaryBookId,
            book.title,
            book.subtitle,
            'book',
            `/${pathKey}`,
            pathKey,
            Math.floor(Math.random() * 15000000) + 5000000,
            null,
            book.pages
        );
    });

    // Secondary Videos
    const secondaryVideos = [
        { title: 'Advanced Algebra', subtitle: 'Quadratic equations and functions', duration: 45 },
        { title: 'Chemistry: The Periodic Table', subtitle: 'Elements and their properties', duration: 40 },
        { title: 'Biology: Cell Structure', subtitle: 'Introduction to cells and tissues', duration: 38 },
        { title: 'Physics: Laws of Motion', subtitle: 'Newton\'s fundamental principles', duration: 42 },
        { title: 'English Literature', subtitle: 'Analyzing poetry and prose', duration: 50 },
        { title: 'Computer Science Basics', subtitle: 'Introduction to programming', duration: 55 }
    ];

    secondaryVideos.forEach((video, i) => {
        const pathKey = `rwandan-education/secondary-school-content/video/${video.title.toLowerCase().replace(/\s+/g, '-')}.mp4`;
        insertContent.run(
            secondaryVideoId,
            video.title,
            video.subtitle,
            'video',
            `/${pathKey}`,
            pathKey,
            Math.floor(Math.random() * 120000000) + 30000000,
            video.duration,
            null
        );
    });

    // Secondary Books
    const secondaryBooks = [
        { title: 'Advanced Mathematics O-Level', subtitle: 'Comprehensive mathematics textbook', pages: 342 },
        { title: 'Chemistry Practical Manual', subtitle: 'Laboratory experiments and procedures', pages: 186 },
        { title: 'Physics Theory and Practice', subtitle: 'Complete physics curriculum', pages: 298 },
        { title: 'Biology Workbook', subtitle: 'Exercises and revision questions', pages: 224 },
        { title: 'English Composition Guide', subtitle: 'Writing skills development', pages: 168 },
        { title: 'Computer Programming in Python', subtitle: 'Introduction to Python', pages: 256 }
    ];

    secondaryBooks.forEach((book, i) => {
        const pathKey = `rwandan-education/secondary-school-content/book/${book.title.toLowerCase().replace(/\s+/g, '-')}.pdf`;
        insertContent.run(
            secondaryBookId,
            book.title,
            book.subtitle,
            'book',
            `/${pathKey}`,
            pathKey,
            Math.floor(Math.random() * 25000000) + 10000000,
            null,
            book.pages
        );
    });

    console.log('Created content items');

    // ============================================
    // 6. SEED LIBRARY BOOKS
    // ============================================
    console.log('Seeding library books...');
    
    const books = [
        { id: 1, name: 'To Kill a Mockingbird', categories: 'Fiction, Classic, American Literature', coverUrl: 'https://images.pexels.com/photos/256450/pexels-photo-256450.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 2, name: '1984', categories: 'Fiction, Dystopian, Classic', coverUrl: 'https://images.pexels.com/photos/159866/books-book-pages-read-literature-159866.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 3, name: 'Pride and Prejudice', categories: 'Fiction, Romance, Classic', coverUrl: 'https://images.pexels.com/photos/1130980/pexels-photo-1130980.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 4, name: 'The Great Gatsby', categories: 'Fiction, Classic, American Literature', coverUrl: 'https://images.pexels.com/photos/2203683/pexels-photo-2203683.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 5, name: 'Harry Potter and the Sorcerer\'s Stone', categories: 'Fiction, Fantasy, Young Adult', coverUrl: 'https://images.pexels.com/photos/2128249/pexels-photo-2128249.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 6, name: 'The Hobbit', categories: 'Fiction, Fantasy, Adventure', coverUrl: 'https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 7, name: 'Sapiens: A Brief History of Humankind', categories: 'Non-Fiction, History, Science', coverUrl: 'https://images.pexels.com/photos/3646172/pexels-photo-3646172.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 8, name: 'Educated', categories: 'Non-Fiction, Memoir, Biography', coverUrl: 'https://images.pexels.com/photos/1370295/pexels-photo-1370295.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 9, name: 'The Alchemist', categories: 'Fiction, Philosophical, Adventure', coverUrl: 'https://images.pexels.com/photos/1643113/pexels-photo-1643113.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 10, name: 'Atomic Habits', categories: 'Non-Fiction, Self-Help, Psychology', coverUrl: 'https://images.pexels.com/photos/4195325/pexels-photo-4195325.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 11, name: 'The Catcher in the Rye', categories: 'Fiction, Coming of Age, Classic', coverUrl: 'https://images.pexels.com/photos/1907785/pexels-photo-1907785.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 12, name: 'Lord of the Flies', categories: 'Fiction, Dystopian, Classic', coverUrl: 'https://images.pexels.com/photos/4132/books-pages-story-stories.jpg?auto=compress&cs=tinysrgb&w=400' },
        { id: 13, name: 'Animal Farm', categories: 'Fiction, Political Satire, Classic', coverUrl: 'https://images.pexels.com/photos/1574643/pexels-photo-1574643.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 14, name: 'The Chronicles of Narnia', categories: 'Fiction, Fantasy, Children', coverUrl: 'https://images.pexels.com/photos/46274/pexels-photo-46274.jpeg?auto=compress&cs=tinysrgb&w=400' },
        { id: 15, name: 'Becoming', categories: 'Non-Fiction, Memoir, Biography', coverUrl: 'https://images.pexels.com/photos/1130601/pexels-photo-1130601.jpeg?auto=compress&cs=tinysrgb&w=400' }
    ];

    const insertBook = serverDb.prepare('INSERT INTO books (id, name, category_ids, coverUrl) VALUES (?, ?, ?, ?)');
    books.forEach(book => {
        insertBook.run(book.id, book.name, book.categories, book.coverUrl);
    });

    console.log('Created library books');

    // ============================================
    // 7. SEED CUSTOM CONTENT (in localDb)
    // ============================================
    console.log('Seeding custom content...');
    
    // Custom content should already have root category from initSchemas
    const customRootId = localDb.prepare('SELECT id FROM categories WHERE path_key = ?').get('custom-content').id;
    
    // Create some custom folders
    const teacherResourcesId = localDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Teacher Resources', 'Materials for teachers', customRootId, 'custom-content/teacher-resources', 0, 0).lastInsertRowid;
    
    const schoolEventsId = localDb.prepare(
        'INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('School Events', 'Documentation of school activities', customRootId, 'custom-content/school-events', 0, 0).lastInsertRowid;

    // Add some custom content items
    const insertLocalContent = localDb.prepare(`
        INSERT INTO content_items (category_id, title, subtitle, type, url, path_key, size, duration, pages, is_disabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const customItems = [
        { catId: teacherResourcesId, title: 'Lesson Plan Template', type: 'book', pages: 5 },
        { catId: teacherResourcesId, title: 'Assessment Guidelines', type: 'book', pages: 12 },
        { catId: teacherResourcesId, title: 'Classroom Management Tips', type: 'video', duration: 15 },
        { catId: schoolEventsId, title: 'Sports Day 2026', type: 'video', duration: 45 },
        { catId: schoolEventsId, title: 'Science Fair Highlights', type: 'video', duration: 30 }
    ];

    customItems.forEach(item => {
        const pathKey = `custom-content/${item.catId === teacherResourcesId ? 'teacher-resources' : 'school-events'}/${item.title.toLowerCase().replace(/\s+/g, '-')}.${item.type === 'video' ? 'mp4' : 'pdf'}`;
        insertLocalContent.run(
            item.catId,
            item.title,
            `Custom ${item.type}`,
            item.type,
            `/${pathKey}`,
            pathKey,
            Math.floor(Math.random() * 10000000) + 1000000,
            item.duration || null,
            item.pages || null
        );
    });

    console.log('Created custom content');

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\nDatabase seeding complete!');
    console.log('='.repeat(50));
    console.log('Summary:');
    console.log('  Users:', serverDb.prepare('SELECT COUNT(*) as count FROM users').get().count);
    console.log('  Categories (Server):', serverDb.prepare('SELECT COUNT(*) as count FROM categories').get().count);
    console.log('  Content Items (Server):', serverDb.prepare('SELECT COUNT(*) as count FROM content_items').get().count);
    console.log('  Library Books:', serverDb.prepare('SELECT COUNT(*) as count FROM books').get().count);
    console.log('  Custom Categories:', localDb.prepare('SELECT COUNT(*) as count FROM categories').get().count);
    console.log('  Custom Content Items:', localDb.prepare('SELECT COUNT(*) as count FROM content_items').get().count);
    console.log('='.repeat(50));
    console.log('\nTest Credentials:');
    console.log('  Admin: admin@somabox.com / admin123');
    console.log('  Teacher: teacher@somabox.com / teacher123');
    console.log('='.repeat(50));
}

// Run the seeder
seedDatabase()
    .then(() => {
        console.log('Seed completed successfully');
        process.exit(0);
    })
    .catch(err => {
        console.error('Seed failed:', err);
        process.exit(1);
    });
