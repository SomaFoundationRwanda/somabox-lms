// The default secondary colour (#0D9488) was too light for white text (3.7:1; the School page
// asks for 4.5:1 and warned about its own default). The new default is #0F766E (5.5:1). Boxes
// still on the old default move with it; a colour a school chose itself is left alone.
export async function up(client) {
    await client.query(`ALTER TABLE unit_branding ALTER COLUMN secondary_color SET DEFAULT '#0F766E'`);
    await client.query(`UPDATE unit_branding SET secondary_color = '#0F766E' WHERE UPPER(secondary_color) = '#0D9488'`);
}
