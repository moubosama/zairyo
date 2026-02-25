<?php

namespace Database\Seeders;

use App\Models\Package;
use Illuminate\Database\Seeder;

class PackageSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // スタンダードパッケージ
        Package::create([
            'name' => 'スタンダード',
            'type' => 'standard',
            'target_layout' => '1LDK～2LDK',
            'base_price' => 620,
            'description' => 'TOTO WT + TOTO ZJ2 + LIXIL ES・標準仕様',
            'specs_json' => Package::getStandardSpecs(),
        ]);

        // ミドルパッケージ
        Package::create([
            'name' => 'ミドル',
            'type' => 'middle',
            'target_layout' => '2LDK',
            'base_price' => 650,
            'description' => 'TOTO WT 1317～ + TOTO ZJ2 + LIXIL ES 2550・電気式床暖房',
            'specs_json' => Package::getMiddleSpecs(),
        ]);

        // ハイグレードパッケージ
        Package::create([
            'name' => 'ハイグレード',
            'type' => 'high_grade',
            'target_layout' => '2LDK～',
            'base_price' => 735,
            'description' => 'LIXIL リノビオP + アラウーノS160 + ガス温水式床暖房・天カセ',
            'specs_json' => Package::getHighGradeSpecs(),
        ]);
    }
}
